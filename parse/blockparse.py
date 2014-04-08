import os
import re
import sys
import time
from struct import unpack
import mmap
from hashlib import sha256
from bitcointools.deserialize import decode_script, extract_public_key
from bitcointools.deserialize import extract_public_key_and_address
from mongodb_store import save_block, get_last_pos, init_connect, update_inputs

def dhash(v):
    a = sha256(v).digest()
    assert len(a) == 32
    return sha256(a).digest()

def tohex(v, rev=True):
    if rev:
        v = v[::-1]
    return v.encode('hex_codec')

class EndOfData(Exception):
    pass

class Block(object):
    def __init__(self):
        self.txes = []
        self.blkTime = 0
        self.prevHash = ''
        self.merkelRootHash = ''
        self.size = 0
        self.dataIndex = 0
        self.offset = 0
        self.hash = ''
        self.height = 0
        
    def vars(self):
        return {
            'hash': self.hash,
            'prevHash': self.prevHash,
            'time': self.blkTime,
            'txes': [tx.vars() for tx in self.txes]
        }

class Tx(object):
    def __init__(self):
        self.inputs = []
        self.outputs = []
        self.hash = None
    
    def vars(self):
        return {
            'hash': self.hash,
            'inputs': [x.vars() for x in self.inputs],
            'outputs': [x.vars() for x in self.outputs]
        }

class Input(object):
    def __init__(self):
        self.script = ''
        self.txHash = None
        self.outputIndex = 0
        self.sequence = None

    def vars(self):
        return {
            'script': self.script,
            'txHash': self.txHash,
            'outputIndex': self.outputIndex,
        }

class Output(object):
    def __init__(self):
        self.script = None
        self.value = 0
        self.address = ''
    
    def vars(self):
        return {
            'address': self.address,
            'script': self.script,
            'value': self.value
        }

class ParserContext(object):
    __coin__ = 'bitcoin'
    __address_version__ = '\x00'
    __magic__ = 0xd9b4bef9

    def __init__(self, dataIndex, height=0):
        self.height = height
        self.dataIndex = dataIndex
        self.fileName = os.path.join(
            os.getenv('HOME'),
            '.%s/blocks/blk%05d.dat' % (self.__coin__, self.dataIndex))

    def ahead(self, cntBytes):
        if self.pos + cntBytes > self.fileSize:
            print 'exc on ahead', self.pos, cntBytes, self.fileSize
            raise EndOfData()
        data = self.mm[self.pos:self.pos + cntBytes]
        self.pos += cntBytes
        return data
        
    def avail(self):
        return self.fileSize - self.pos

    def parseVarInt(self):
        c = ord(self.ahead(1))
        if c < 0xfd:
            return c
        elif c == 0xfd:
            (v,) = unpack('H', self.ahead(2))
            return v
        elif c == 0xfe:
            (v,) = unpack('I', self.ahead(4))
            return v
        else:
            (v,) = unpack('Q', self.ahead(8))
            return v

    def parseBin(self):
        size = self.parseVarInt()
        return self.ahead(size)

    def end(self):
        return self.pos >= self.fileSize

    def parseBlocks(self, offset=0):
        with open(self.fileName, 'rb') as f:
            f.seek(0, 2)
            self.fileSize = f.tell()
            f.seek(0)
            self.mm = mmap.mmap(f.fileno(),
                                self.fileSize,
                                mmap.MAP_PRIVATE,
                                mmap.PROT_READ)
            self.pos = offset
            while not self.end():
                blockOffset = self.pos
                try:
                    yield self.parseBlock()
                except EndOfData:
                    print 'endof data', self.pos
                    self.pos = blockOffset
                    break

    def parseInputs(self):
        nInputs = self.parseVarInt()
        inputs = []
        for _ in xrange(nInputs):
            input = Input()
            input.txHash, input.outputIndex = unpack('32si', self.ahead(36))
            input.txHash = tohex(input.txHash)
            input.script = self.parseBin()
            (input.sequence,) = unpack('I', self.ahead(4))
            inputs.append(input)
        return inputs

    def parseOutputs(self):
        outputs = []
        nOutputs = self.parseVarInt()
        for _ in xrange(nOutputs):
            output = Output()
            (output.value,) = unpack('Q', self.ahead(8))
            output.script = self.parseBin()
            output.address = extract_public_key(output.script, version=self.__address_version__)
            if not re.match(r'[0-9A-Za-z]+$', output.address):
                print >>sys.stderr, 'illegal address', repr(output.address), output.vars()
                output.address = ''
            outputs.append(output)
        return outputs
    
    def parseTx(self):
        startPos = self.pos
        (version,) = unpack('I', self.ahead(4))
        if version not in (1, 2):
            print >>sys.stderr, 'version is different %s' % version
        
        tx = Tx()
        tx.inputs = self.parseInputs() 
        tx.outputs = self.parseOutputs()
        (lockTime,) = unpack('I', self.ahead(4))
        d = self.mm[startPos:self.pos]
        tx.hash = dhash(d)
        #printd.encode('hex_codec'), repr(tx.hash), startPos, self.pos, lockTime,
        tx.hash = tohex(tx.hash)
        return tx

    def parseBlock(self):
        b = Block()
        b.dataIndex = self.dataIndex
        b.offset = self.pos

        data = self.ahead(8)
        magic, b.size = unpack('II', data)
        if magic != self.__magic__:
            print 'magic diff'
            raise EndOfData()
        if  b.size <= 80:
            print 'size', b.size
            raise EndOfData()

        b.hash = tohex(dhash(self.mm[self.pos:self.pos+80]))
        (version, b.prevHash, b.merkleRootHash, 
         b.blkTime, blkBits, blkNonce) = unpack('I32s32sIII',
                                              self.ahead(80))
        assert version in (1, 2), 'version %s is not 1' % version
        b.prevHash = tohex(b.prevHash)
        
        nTx = self.parseVarInt()
        #print '====', time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(b.blkTime)), nTx
        for _ in xrange(nTx):
            tx = self.parseTx()
            b.txes.append(tx)
        return b

class LTCParserContext(ParserContext):
    __coin__ = 'litecoin'
    __address_version__ = '\x30'
    __magic__ = 0xdbb6c0fb

class DTCParserContext(ParserContext):
    __coin__ = 'dogecoin'
    __address_version__ = '\x1e'
    __magic__ = 0xc0c0c0c0

def main(coin):
    init_connect(coin)
    ContextClasses = [ParserContext, LTCParserContext, DTCParserContext]
    ContextClass = [cls for cls in ContextClasses if cls.__coin__ == coin][0]
    file_id, file_pos, height = get_last_pos(ContextClass.__coin__)
    print 'last position', file_id, file_pos, height

    for i in xrange(file_id, file_id + 200):
        context = ContextClass(i, height=height)
        offset = file_pos
        file_pos = 0
        if not os.path.exists(context.fileName):
            break
        print time.strftime('%Y-%m-%d %H:%M:%S'), context.fileName
        try:
            for b in context.parseBlocks(offset=offset):
                b.height = height
                height += 1
                save_block(context.__coin__, b)
                update_inputs(context.__coin__, update_spent=False)
        except:
            import traceback
            traceback.print_exc()
            raise

if __name__ == '__main__':
    if len(sys.argv) < 2:
        coin = 'bitcoin'
    else:
        coin = sys.argv[1]
    main(coin)
