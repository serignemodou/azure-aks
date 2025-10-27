import * as network from "@pulumi/azure-native/network"
import * as pulumi from '@pulumi/pulumi';
import * as privatedns from '@pulumi/azure-native/privatedns'

import {resourceGroup, env, projectName, tags} from "./common"
import {fwPrivateIP} from "./firewall"

interface NetworkConfig {
    vnetCIDR: [string],
    snetAksCIDR: string,
    snetPostgreCIDR: string,
    podCIDR: string,
    serviceCIDR: string,
    snetDataCIDR: string,
    snetRegistryCIDR: string
}

const ntwConfig = new pulumi.Config('networkSpoke').requireObject<NetworkConfig>('config')

/* Route table and route to forward webapp outbound trafic throught firewall*/
const routeTableName = `rt-spoke-to-hub-${projectName}-${env}`
const routeTable = new network.RouteTable(routeTableName, {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    routeTableName: routeTableName,
    tags: tags,
})

const routeName = `rt-webapp-outbound-through-fw`
new network.Route('routeName', {
    resourceGroupName: resourceGroup.name,
    routeTableName: routeTable.name,
    routeName: routeName,
    addressPrefix: '0.0.0.0/0',
    nextHopType: network.RouteNextHopType.VirtualAppliance,
    nextHopIpAddress: fwPrivateIP
})

const vnetName = `vnet-${projectName}-${env}`
export const vnet = new network.VirtualNetwork(vnetName, {
    resourceGroupName: resourceGroup.name,
    virtualNetworkName: vnetName, 
    location: resourceGroup.location,
    enableDdosProtection: false,
    addressSpace: {
        addressPrefixes: ntwConfig.vnetCIDR
    },
    tags,
})

const snetAksName = `snet-aks-${projectName}-${env}`
export const snetAks = new network.Subnet(snetAksName, {
    resourceGroupName: resourceGroup.name,
    subnetName: snetAksName,
    virtualNetworkName: vnet.name,
    addressPrefix: ntwConfig.snetAksCIDR,
    privateEndpointNetworkPolicies: 'Enabled',
    privateLinkServiceNetworkPolicies: 'Disaled',
    delegations: [
        {
            name: 'Microsoft-Aks',
            serviceName: 'Microsoft.ContainerService/managedClusters'
        }
    ],
    routeTable: {
        id: routeTable.id,
    }
})

const snetPostgresName = `snet-postgres-${projectName}-${env}`
export const snetPostgres = new network.Subnet(snetPostgresName, {
    resourceGroupName: resourceGroup.name,
    virtualNetworkName: vnet.name,
    addressPrefix: ntwConfig.snetPostgreCIDR,
    privateEndpointNetworkPolicies: 'Enabled',
    subnetName: snetPostgresName,
    delegations: [
        {
            name: 'Microsoft-DBforPostgreSQL-flexibleServers',
            serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
        }
    ]
})

/** subnet for key vault and storage account */
const snetDataName = `snet-data-${projectName}-${env}`
export const snetData = new network.Subnet(snetDataName, {
    resourceGroupName: resourceGroup.name,
    virtualNetworkName: vnet.name,
    addressPrefix: ntwConfig.snetDataCIDR,
    subnetName: snetDataName,
})

/** subnet container registry */
const snetRegistryName = `snet-registry-${projectName}-${env}`
export const snetRegistry = new network.Subnet(snetDataName, {
    resourceGroupName: resourceGroup.name,
    virtualNetworkName: vnet.name,
    addressPrefix: ntwConfig.snetRegistryCIDR,
    subnetName: snetRegistryName,
})
