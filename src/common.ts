import * as resources from '@pulumi/azure-native/resources'
import * as pulumi from '@pulumi/pulumi';

export const env = pulumi.getStack()
export const projectName = pulumi.getProject()

export const tags = {
    projectName: projectName,
    env: env,
    git: 'git@github.com:serignemodou/azure-aks.git'
}

const resourceGroupName = `rg-${projectName}-${env}`
export const resourceGroup = new resources.ResourceGroup(resourceGroupName, {
    resourceGroupName: resourceGroupName,
    tags: tags,
})

export const azureNativeConfig = new pulumi.Config('azure-native')
export const tenantId = azureNativeConfig.require('tenantId')