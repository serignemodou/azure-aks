import * as aks from "@pulumi/azure-native/containerservice"
import * as azuread from "@pulumi/azuread";
import * as managedIdentity from "@pulumi/azure-native/managedidentity"
import * as authorization from "@pulumi/azure-native/authorization"
import * as pulumi from '@pulumi/pulumi';

import {env, projectName, resourceGroup, tags, tenantId} from "./common"
import {snetAks, snetPostgres} from "./spokeNetwork"
import {prvZoneDns} from "./privateDnsZone"
import {registry} from "./registryAcr"
import {vault} from "./keyVault"

interface aksManagedClusterConfig {
    kubernetesVersion: string,
    podCIDR: string,
    serviceCIDR: string,
    skuName: string,
    skuTier: string,
    dnsServiceIP: string
}

interface systemNodePoolConfig {
    count: number,
    maxCount: number,
    minCount: number,
    maxPods: number,
    mode: string
    enableAutoScaling: boolean,
    osDiskSizeGB: number,
    osDiskType: string,
    osSKU: string,
    osType: string,
    vmSize: string,
    orchestratorVersion: string,
    availabilityZones: [string],
    workloadRuntime: string,
    type: string,
}

interface appNodePoolConfig {
    count: number,
    maxCount: number,
    minCount: number,
    maxPods: number,
    mode: string,
    enableAutoScaling: boolean,
    osDiskSizeGB: number,
    osDiskType: string,
    osSKU: string,
    osType: string,
    vmSize: string,
    orchestratorVersion: string,
    availabilityZones: [string],
    workloadRuntime: string,
    type: string,
}

const managedCluster = new pulumi.Config('aks').requireObject<aksManagedClusterConfig>('managedCluster')
const appNodePool = new pulumi.Config('aks').requireObject<appNodePoolConfig>('appNodePool')
const systemNodePool = new pulumi.Config('aks').requireObject<systemNodePoolConfig>('systemNodePool')

const adminAksGroupName = `grp-admin-aks-${projectName}-${env}`
const adminGrpAks = new azuread.Group(adminAksGroupName, {
    displayName: adminAksGroupName,
    securityEnabled: true,
})

const kubeletUaiName = `kubelet-uia-${projectName}-${env}`
const kubeletUai = new managedIdentity.UserAssignedIdentity(kubeletUaiName, {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    resourceName: kubeletUaiName,
    tags,
})

const workloadUaiName = `wuai-${projectName}-${env}`
const workloadUai = new managedIdentity.UserAssignedIdentity(workloadUaiName, {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    resourceName: workloadUaiName,
    tags,
})

const aksName = `aks-${projectName}-${env}`
const aksManagedCluster = new aks.ManagedCluster(aksName, {
    resourceGroupName: resourceGroup.name,
    resourceName: aksName,
    location: resourceGroup.location,
    kubernetesVersion: managedCluster.kubernetesVersion,
    enableRBAC: true,
    dnsPrefix: `aks-dns-${env}`,
    publicNetworkAccess: aks.PublicNetworkAccess.Disabled,
    identity: {
        type: aks.ResourceIdentityType.SystemAssigned  // Managed Identity used by the Control plan
    },
    identityProfile: { // Managed Identity used by kubelet
        userManagedIdentityKubelet: {
            clientId: kubeletUai.clientId,
            objectId: kubeletUai.principalId,
            resourceId: kubeletUai.id
        }
    },
    aadProfile: {
        adminGroupObjectIDs: [adminGrpAks.objectId],
        managed: false,
        tenantID: tenantId,
        enableAzureRBAC: true,
    },
    apiServerAccessProfile: {
        enablePrivateCluster: true, // Will create a private endpoint (NIC private IP) and associate it the the aks
        enablePrivateClusterPublicFQDN: true, // fqdn api-server will  be <cluster-name>.<privateDNSZone-name>, the nslookup of this domain must return thi private ip of the service endpoint
        privateDNSZone: prvZoneDns.id // Option 'system' allow only resource in the same vnet (node, pod, other resources) to resolve aks dns api-server
    },
    networkProfile: {
        networkDataplane: 'Cilium',
        networkMode: 'Transparent',
        networkPlugin: 'Azure',
        networkPluginMode: 'Overlay',
        networkPolicy: 'Cilium',
        podCidr: managedCluster.podCIDR,
        serviceCidr: managedCluster.serviceCIDR,
        dnsServiceIP: managedCluster.dnsServiceIP,
        outboundType: aks.OutboundType.UserDefinedRouting  
    },
    agentPoolProfiles: [
        {
            count: systemNodePool.count,
            name: 'nodepool-system',
            mode: systemNodePool.mode,
            maxCount: systemNodePool.maxCount,
            minCount: systemNodePool.minCount,
            maxPods: systemNodePool.maxPods,
            enableAutoScaling: systemNodePool.enableAutoScaling,
            availabilityZones: systemNodePool.availabilityZones,
            osDiskSizeGB: systemNodePool.osDiskSizeGB,
            osDiskType: systemNodePool.osDiskType,
            osSKU: systemNodePool.osSKU,
            osType: systemNodePool.osType,
            vmSize: systemNodePool.vmSize,
            orchestratorVersion: systemNodePool.orchestratorVersion,
            type: systemNodePool.type,
            workloadRuntime: systemNodePool.workloadRuntime,
            nodeTaints: [
                "nodepool: system"
            ],
            nodeLabels: {
                app: "system"
            },
        }
    ],
    oidcIssuerProfile: {
        enabled: true
    },
    securityProfile: {
        workloadIdentity: {
            enabled: true,

        }
    },
    sku: {
        name: managedCluster.skuName,
        tier: managedCluster.skuTier
    },
    storageProfile: {
        diskCSIDriver: {
            enabled: false,
        },
        blobCSIDriver: {
            enabled: false
        },
        fileCSIDriver: {
            enabled: false
        }
    },
    autoUpgradeProfile: {
        nodeOSUpgradeChannel: aks.NodeOSUpgradeChannel.NodeImage,
        upgradeChannel: aks.UpgradeChannel.Stable
    },
    workloadAutoScalerProfile: {
        keda: {
            enabled: true
        }
    },
    addonProfiles: {
        azureKeyvaultSecretsProvider: {
            enabled: true
        }
    },
    autoScalerProfile: {
        maxNodeProvisionTime: '15m',
        maxTotalUnreadyPercentage: '45',
        okTotalUnreadyCount: '3'
    },
    tags,
})

const appAgentPoolName = `aks-app-pool-${projectName}-${env}`
new aks.AgentPool(appAgentPoolName, {
    resourceGroupName: resourceGroup.name,
    agentPoolName: appAgentPoolName,
    resourceName: aksManagedCluster.name,
    count: appNodePool.count,
    enableAutoScaling: false,
    enableEncryptionAtHost: false,
    enableNodePublicIP: false,
    kubeletConfig: {
        containerLogMaxFiles: 5,
        containerLogMaxSizeMB: 100,
        cpuCfsQuota: false,
        failSwapOn: false,
    },
    kubeletDiskType: 'OS',
    linuxOSConfig: {
        swapFileSizeMB: 100,
    },
    maxCount: appNodePool.maxCount,
    maxPods: appNodePool.maxPods,
    minCount: appNodePool.minCount,
    mode: appNodePool.mode,
    nodeLabels: {
        app: "user"
    },
    orchestratorVersion: appNodePool.orchestratorVersion,
    nodeTaints: [
        "nodepool: user"
    ],
    osDiskSizeGB: appNodePool.osDiskSizeGB,
    osDiskType: appNodePool.osDiskType,
    osSKU: appNodePool.osSKU,
    osType: appNodePool.osType,
    availabilityZones: appNodePool.availabilityZones,
    securityProfile: {
        enableSecureBoot: false
    },
    type: appNodePool.type,
    upgradeSettings:{
        maxSurge: '',
        drainTimeoutInMinutes: 5,
        nodeSoakDurationInMinutes: 5
    },
    vmSize: appNodePool.vmSize,
    vnetSubnetID: snetAks.id,
    workloadRuntime: 'OCIContainer',
})

const acrPullRoleDefinition = new authorization.RoleDefinition(`acr-pull-role-definition$-${env}`, {
    roleName: 'AcrPull',
    scope: registry.id
})

new authorization.RoleAssignment(`acr-pull-role-assignement`, {
    roleAssignmentName: 'acr-pull',
    roleDefinitionId: acrPullRoleDefinition.id,
    principalId: aksManagedCluster.identityProfile.apply(profil => profil!['kubeletidentity'].principalId!),
    scope: registry.id
})

const vaultRoleDefinition = new authorization.RoleDefinition(`vault-role-definition-${env}`, {
    roleName: 'Key Vault Secrets User',
    scope: vault.id,
})

new authorization.RoleAssignment(`vault-role-assignement`, {
    roleAssignmentName: 'key-vault-secrets-user',
    roleDefinitionId: vaultRoleDefinition.id,
    principalId: workloadUai.principalId,
    scope: vault.id
})
