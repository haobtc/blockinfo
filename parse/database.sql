create table `block` (
       id integer not null primary key auto_increment,
       `hash` varchar(64) not null default '0',
       file_index integer not null,
       file_offset integer not null,
       byte_size integer not null,
       blk_time integer not null default 0,
       count_tx integer not null default 0,
       UNIQUE INDEX block_hash (`hash`),
       INDEX block_filepos (file_index, file_offset)
) engine=InnoDB;

create table `tx` (
       `hash` varchar(64) not null primary key,
       block_id integer not null,
       block_index integer not null
) engine=InnoDB;

create table `tx_input` (
       id integer not null primary key auto_increment,
       tx_hash varchar(64) not null,
       output_id integer not null default 0,
       script varbinary(512) not null default '',
       # output_tx_hash varchar(64) not null,
       # output_index integer not null,
       INDEX input_output(output_id),
       INDEX input_tx(tx_hash)
) engine=InnoDB;

create table `tx_output` (
       id integer not null primary key auto_increment,
       tx_hash varchar(64) not null,
       value bigint not null default 0,
       spent boolean default false,
       address varchar(80) not null,
       output_index integer not null,
       script varbinary(512) not null default '',
       INDEX input_tx(tx_hash),
       INDEX input_spent(spent),
       INDEX input_unspent(address, spent),
       UNIQUE INDEX input_tx_post(tx_hash, output_index)
) engine=InnoDB;
