import * as network from "@pulumi/azure-native/network"
import * as pulumi from '@pulumi/pulumi';
import { env, projectName, resourceGroup, tags } from './common';

interface networkHubConfig {
    vnetCIDR: [string],
    snetFirewall: string
}

const networkHub = new pulumi.Config('networkHub').requireObject<networkHubConfig>('config')
const vnetHubName = `vnet-hub-${projectName}-${env}`
export const vnetHub = new network.VirtualNetwork(vnetHubName, {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    virtualNetworkName: vnetHubName,
    addressSpace: {
        addressPrefixes: networkHub.vnetCIDR
    },
    tags,
})

const snetFirewallName = `snet-fw-${projectName}-${env}`
export const snetFw = new network.Subnet(snetFirewallName, {
    resourceGroupName: resourceGroup.name,
    virtualNetworkName: vnetHub.name,
    subnetName: snetFirewallName,
    addressPrefix: networkHub.snetFirewall
})