import * as random from "@pulumi/random"
import * as keyvault from "@pulumi/azure-native/keyvault"
import * as monitor from "@pulumi/azure-native/monitor"
import * as network from "@pulumi/azure-native/network"

import {env, resourceGroup, tags, tenantId, projectName} from './common'
import {snetData} from "./spokeNetwork"
import * as pulumi from '@pulumi/pulumi';

const randomSuffix = new random.RandomString(`kv-rdn-name`, {
    length: 3,
    special: false
})

export const vault = randomSuffix.result.apply((randomSuffix) => {
    const kvname = `kv-aks-${env}-${randomSuffix.toLowerCase()}`

    const kv = new keyvault.Vault(`kv-aks-${env}`, {
        vaultName: kvname,
        resourceGroupName: resourceGroup.name,
        properties: {
            enabledForDeployment: true,
            enabledForDiskEncryption: true,
            enabledForTemplateDeployment: true,
            enableSoftDelete: true,
            enableRbacAuthorization: true,
            enablePurgeProtection: true,
            publicNetworkAccess: keyvault.PublicNetworkAccess.Disabled,
            sku: {
                family: keyvault.SkuFamily.A,
                name: keyvault.SkuName.Standard
            },
            tenantId: tenantId,
        },
        tags: tags
    })
    return kv
})

new network.PrivateEndpoint(`pe-kv-allodoctor`, {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    privateEndpointName: `pe-aks-${projectName}-${env}`,
    subnet: {
        id: snetData.id
    },
    id: vault.id,
})

export const kVault = {
    id: vault.id,
    uri: pulumi.interpolate`https://${vault.name}.vault.azure.net/`,
    name: vault.name,
    resourceGroup: resourceGroup.name
}