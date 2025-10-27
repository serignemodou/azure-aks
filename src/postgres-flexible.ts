import * as pulumi from '@pulumi/pulumi';
import * as random from '@pulumi/random';
import * as monitor from "@pulumi/azure-native/monitor";

import * as postgresql from "@pulumi/azure/postgresql"


import {env, tags, resourceGroup, projectName} from './common';
import {snetPostgres} from "./spokeNetwork";
import {prostgresZoneDns} from './privateDnsZone'


interface PgSqlFlexibleConfig {
    adminUsername: string
    storageMb: number,
    skuName: string,
    skuTier: string,
    dbName: string,
    highAvailability: boolean,
    backupRetentionDays: number,
}

const namePassword = new random.RandomPassword(`passwordDB`, {
    length: 12,
    special: false,
    upper: true,
})

const pgSqlFlexible = new pulumi.Config('postgresqlflexible').requireObject<PgSqlFlexibleConfig>('config')

let highAvailabilityParams: any; 
if (pgSqlFlexible.highAvailability){
    highAvailabilityParams = {
        mode: 'ZoneRedundant',
        standbyAvailibilityZone: '2'
    }
}

const pgName = `psql-flexible-${pgSqlFlexible.dbName}-${env}`
const flexibleServer = new postgresql.FlexibleServer(
    pgName, {
        resourceGroupName: resourceGroup.name,
        location: resourceGroup.location,
        version: '17',
        delegatedSubnetId: snetPostgres.id,
        privateDnsZoneId: prostgresZoneDns.id,
        administratorLogin: pgSqlFlexible.adminUsername,
        administratorPassword: namePassword.result,
        skuName: pgSqlFlexible.skuName,
        highAvailability: highAvailabilityParams,
        storageMb: pgSqlFlexible.storageMb,
        geoRedundantBackupEnabled: false,
        backupRetentionDays: pgSqlFlexible.backupRetentionDays,
        publicNetworkAccessEnabled: false,
        tags: tags,
},{
    ignoreChanges: ['tags']
})

//Minimum Required Params
//For All Params https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-server-parameters
const pgConfig = {
    'connection_throttle.enable': 'on',
    application_name: `${projectName}-${env}`,
    log_min_messages: 'notice',
    log_min_duration_statement: '3000',
    log_checkpoints: 'on',
    log_line_prefix: '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h',
    log_lock_waits: 'on',
    log_statement: 'ddl',
    log_temp_files: '0',
    log_autovacum_duration: '0',
    lock_timeout: '600000',
    idle_in_transaction_session_timeout: '3000',
    'pgms_wait_sampling.query_capture_mode': 'All',
    'pgbouncer.enabled': 'true', 
    'statement_timeout': '60000',
    'azure.extensions': 'PG_STAT_STATEMENTS,PG_BUFFERCACHE,HYPOPG,PGAUDIT,PGSTATTUPLE,PG_TRGM,UNACCENT,PGCRYPTO'
}

Object.entries(pgConfig).forEach(([name, value]) => {
    new postgresql.FlexibleServerConfiguration(`flexibleConfiguration-${name}-${env}`, {
        serverId: flexibleServer.id,
        name,
        value,
    })
})

new postgresql.FlexibleServerDatabase('flexibleServerDatabase', {
    serverId: flexibleServer.id,
    name: pgSqlFlexible.dbName,
    collation: 'en_US.utf8',
    charset: 'utf8'
})

export const pgPassword = namePassword.result
export const pgUsername = pgSqlFlexible.adminUsername
export const pgDbName = pgSqlFlexible.dbName
export const pgFqdn = flexibleServer.fqdn