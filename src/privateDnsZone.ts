import * as privatedns from '@pulumi/azure-native/privatedns'

import {env, resourceGroup, projectName, tags } from "./common"
import {vnetHub} from "./hubNetwork"
import {vnet} from "./spokeNetwork"

export const prvZoneDns = new privatedns.PrivateZone('aks-prv-zone-dns', {
    resourceGroupName: resourceGroup.name,
    privateZoneName: `private-${resourceGroup.location}.azmk8s.io`,
    tags,
})

new privatedns.VirtualNetworkLink('zone-dns-spoke-vnet-link', {
    resourceGroupName: resourceGroup.name,
    virtualNetworkLinkName: `link-to-vnet-spoke`,
    privateZoneName: prvZoneDns.name,
    virtualNetwork: {
        id: vnet.id
    }
})

new privatedns.VirtualNetworkLink('zone-dns-hub-vnet-link', {
    resourceGroupName: resourceGroup.name,
    virtualNetworkLinkName: `link-to-vnet-hub`,
    privateZoneName: prvZoneDns.name,
    virtualNetwork: {
        id: vnetHub.id
    },
    registrationEnabled: false
})
