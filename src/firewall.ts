import * as pulumi from '@pulumi/pulumi';
import * as network from "@pulumi/azure-native/network"

import {env, projectName, resourceGroup, tags} from "./common"
import {snetFw} from "./hubNetwork"

const firewallName = `fw-${projectName}-${env}`

interface firewallConfig {
    skuTier: string,
    zones: [string],
    minCapacity: number,
    maxCapacity: number
}
const firewallConfig = new pulumi.Config('firewall')
export const fwConfig = firewallConfig.requireObject<firewallConfig>('config')

const fwPulicIpName = `pip-fw-${projectName}-${env}`
const fwPublicIP = new network.PublicIPAddress(fwPulicIpName, {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    publicIpAddressName: fwPulicIpName
})

const firewall = new network.AzureFirewall(firewallName, {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    azureFirewallName: firewallName,
    ipConfigurations: [{
        name: `fw-ip-configuration`,
        publicIPAddress: {
            id: fwPublicIP.id,
        },
        subnet: {
            id: snetFw.id
        }
    }],
    sku: {
        name: network.AzureFirewallSkuName.AZFW_VNet,
        tier: fwConfig.skuTier
    },
    zones: fwConfig.zones,
    autoscaleConfiguration: {
        minCapacity: fwConfig.minCapacity,
        maxCapacity: fwConfig.maxCapacity,
    },
    tags: tags
})

export const fwPrivateIP = firewall.ipConfigurations.apply(fw => fw && fw?.length > 0 ? fw[0].privateIPAddress : "")