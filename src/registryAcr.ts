import * as acr from "@pulumi/azure-native/containerregistry"
import * as network from "@pulumi/azure-native/network"
import {env, projectName, resourceGroup, tags} from "./common"
import * as pulumi from '@pulumi/pulumi';
import {snetRegistry} from "./spokeNetwork"

interface acrParams {
    sku: string,
    zoneRedundant: string,
}
const acrConfig = new pulumi.Config('acr').requireObject<acrParams>('config')

const acrName = `acr-${projectName}-${env}`

export const registry = new acr.Registry(acrName, {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    registryName: acrName,
    sku: {
        name: acrConfig.sku,
    },
    identity: {
        type: acr.ResourceIdentityType.SystemAssigned
    },
    adminUserEnabled: false,
    publicNetworkAccess: acr.PublicNetworkAccess.Disabled,
    networkRuleSet: {
        defaultAction: 'Deny',
        ipRules: [
            {
                iPAddressOrRange: '0.0.0.0/0',
                action: 'Allow'
            }
        ]
    },
    policies: {
        retentionPolicy: {
            days: 7
        },
        softDeletePolicy: {
            retentionDays: 7
        }
    },
    anonymousPullEnabled: false,
    zoneRedundancy: acrConfig.zoneRedundant,
    dataEndpointEnabled: false,
    tags,
})


new network.PrivateEndpoint(`pe-kv-allodoctor`, {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    privateEndpointName: `pe-aks-${projectName}-${env}`,
    subnet: {
        id: snetRegistry.id
    },
    id: registry.id,
})

const repositoryName = `acr-repo-${env}`
const scopeMap = new acr.ScopeMap('scopeMap', {
    resourceGroupName: resourceGroup.name,
    registryName: registry.name,
    description: "Repository allowed to push image",
    scopeMapName: `scope-map-${env}`,
    actions: [
        `repositories/${repositoryName}/content/read`,
        `repositories/${repositoryName}/content/write`,
        `repositories/${repositoryName}/metadata/write`,
        `repositories/${repositoryName}/metadata/write`
    ]
})

//Token used by CI pipeline to push docker image
const tokenCI = new acr.Token(`token-cicd-push-${env}`, {
    registryName: registry.name,
    resourceGroupName: resourceGroup.name,
    tokenName: `token-cicd-push-${env}`,
    status: acr.TokenStatus.Enabled,
    scopeMapId: scopeMap.id,
})

const token = acr.getTokenOutput({
    resourceGroupName: resourceGroup.name,
    registryName: registry.name,
    tokenName: tokenCI.name
})
 const credentials = token.apply(t => acr.listRegistryCredentialsOutput({
    registryName: registry.name,
    resourceGroupName: resourceGroup.name,
 }))


 // Information Used in the CI pipeline to push image
 export  const acrUsername = credentials.username
 export const acrPassword  = credentials.passwords?.apply(pwd => pwd?.values)
 export const registreFqdn = registry.loginServer