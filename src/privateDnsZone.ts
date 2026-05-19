import * as privatedns from '@pulumi/azure-native/privatedns'

import {env, resourceGroup, projectName, tags } from "./common"
import {vnetHub} from "./hubNetwork"
import {vnet} from "./spokeNetwork"

/*
En mode privé, l'API server a besoin de créer un enregistrement DNS dans la zone privée. Par défaut AKS crée une zone DNS 
privée dans la souscription dans laquelle il a été déployé (cela peut créer des soucis de résolution DNS).
Donc pour que la résolution se passe correctement, il est requis d'utiliser la zone DNS privée centralisée dans le hub.
*/

export const aksPrvZoneDns = new privatedns.PrivateZone('aks-prv-zone-dns', {
    resourceGroupName: resourceGroup.name,
    privateZoneName: `private-${resourceGroup.location}.azmk8s.io`,
    tags,
})

new privatedns.VirtualNetworkLink('zone-dns-spoke-vnet-link', {
    resourceGroupName: resourceGroup.name,
    virtualNetworkLinkName: `link-to-vnet-spoke`,
    privateZoneName: aksPrvZoneDns.name,
    virtualNetwork: {
        id: vnet.id
    }
})

new privatedns.VirtualNetworkLink('zone-dns-hub-vnet-link', {
    resourceGroupName: resourceGroup.name,
    virtualNetworkLinkName: `link-to-vnet-hub`,
    privateZoneName: aksPrvZoneDns.name,
    virtualNetwork: {
        id: vnetHub.id
    },
    registrationEnabled: false
})

export const prostgresZoneDns = new privatedns.PrivateZone('postgresql-prv-zone-dns', {
    resourceGroupName: resourceGroup.name,
    privateZoneName: `beapp.${env}.prv.postgres.database.azure.com`,
    tags,
})

new privatedns.VirtualNetworkLink('zone-dns-spoke-vnet-link', {
    resourceGroupName: resourceGroup.name,
    virtualNetworkLinkName: `link-to-vnet-spoke`,
    privateZoneName: prostgresZoneDns.name,
    virtualNetwork: {
        id: vnet.id
    }
})

new privatedns.VirtualNetworkLink('zone-dns-hub-vnet-link', {
    resourceGroupName: resourceGroup.name,
    virtualNetworkLinkName: `link-to-vnet-hub`,
    privateZoneName: prostgresZoneDns.name,
    virtualNetwork: {
        id: vnetHub.id
    },
    registrationEnabled: false
})
