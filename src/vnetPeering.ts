import * as network from '@pulumi/azure-native/network';

import {env, projectName, resourceGroup, tags} from "./common"
import {vnetHub} from "./hubNetwork"
import {vnet} from "./spokeNetwork"


new network.VirtualNetworkPeering('spoke-hub-peering', {
    resourceGroupName: resourceGroup.name,
    virtualNetworkPeeringName: `spoke-hub-peer-${env}`,
    allowVirtualNetworkAccess: true,
    allowForwardedTraffic: true,
    useRemoteGateways: true,
    allowGatewayTransit: false,
    enableOnlyIPv6Peering: false,
    virtualNetworkName: vnet.name,
    remoteVirtualNetwork: {
        id: vnetHub.id
    }
})

new network.VirtualNetworkPeering('hub-spoke-peering',{
    resourceGroupName: resourceGroup.name,
    virtualNetworkPeeringName: `hub-spoke-peer-${env}`,
    allowVirtualNetworkAccess: true,
    allowForwardedTraffic: true,
    useRemoteGateways: false,
    allowGatewayTransit: true,
    enableOnlyIPv6Peering: false,
    virtualNetworkName: vnetHub.name,
    remoteVirtualNetwork: {
        id: vnet.id
    }
})