# Authentication
Cette page a pour objectif de décrire les mécanismes d'authentification pour un pod ayant besoin d'accès à des données d'autres ressources Azure.

## 1. Général
Lorsqu'un application déployée dans un cluster  AKS (workload) a besoin d'accèder à une autre ressource Azure (Key Vault, Storage Account, ...) sécurisée au travers de droits RBAC, celui-ci doit s'authentifier auprès de cette ressource.

Pour éviter l'utilisation de secrets static (username/password), la bonne pratique dans azure est d'utiliser une __identité managée__.

La bonne nouvelle: Workload Identity permet justement à un pod de s'authentifier via une identité pour accéder aux services Azure. 

La solution la plus "simple" consisterait à associer le cluster AKS dans sa globalité (voir un node entier) à une identité managée.
Celle-ci serait alors utilsée depuis les pods pour s'authentifier. Seulement l'indentité posséderait l'ensemble  des droits dont toutes les applications ont besoin pour accèder aux différentes ressources Azure. 
D'un point de vue sécurité, c'est à proscrire.

Donc pour limiter la surface d'attaque, la solution à retenir est d'associer une identité Azure à un pod en particulier au travers d'un service Account Kubernetes.

Cette mise en place est possible car AKS propose une intégration OIDC qui va permettre à kubernetes d'émettre des token JWT compatible avec des fourniseurs d'identité externes et donc faire en sorte qu'une application dans un pod AKS accède en toute sécurité à des ressource Azure.

## 2. Comment cela fonctionne ? 
![alt text](../media/authentication.jpg)

1. Control plan
    - Le control plan demmande un token d'authentification à EntraID via son __Managed identity__
    - Un token est retourné avec les permissions RBAC associés au managed identity (Network Contributor, Private DNS Zone Contributor)
    - Le control plan l'utilise pour accèder aux ressources azure

2. Noeud (kubelet)
    - L'agent kubelet demande un token d'authentification à Entra ID via le managed identity du node
    - Un token lui est retourné avec les permissions RBAC associés au managed identity (Acr Pull)
    - Kubelet l'utilise pour accéder aux ressources azure (ACR Registry)

3. Workload
    - Le pod demande un token d'authentification à Entra ID via un échage de Token avec Workload Identity
    - Un token lui est envoyé avec les permissions RBAC associés au workload identity
    - Il l'utlise pour accéder aux ressources Azure (Key Vault, Storage Account, Data Base ...)

## 3. Quelles sont les actions à mettre en oeuvre
- Activer l'IODC et le worklload identity sur le cluster
- Créer une identité managée Azure
- Assigner les roles à l'identité sur les ressources à laquelle l'application doit accéder
- Créer un service account kubernetes en utilisant l'annotation azure.workload.identity/client-id pour faire le lien avec l'identité managée
- Configurer la fédération d'identité au niveau de l'identié managée Azure
- Configurer le pod pour utiliser le service Account en tant que workload Identity en n'oubliant pas de définir le label azure.workload.identity/use positionné à true.

## 4. Exemple
Ci-dessous un exemple de mise en oeuvre pour une application qui a besoin d'accéder aux secret d'un Key Vault
- Acttivation de l'OIDC issuer / Workload Identity
```
az aks update \
--name aks-private-cluster \
--resource-group rg-name \
--enable-oidc-issuer \
--enable-workoad-identity
```

- Création d'une identité managée Azure

```
az identity create \
--resource-group rg-name \
--name uia-aks \
--location francecentral 
```

- Assignation des droits qui vont bien à l'identité
```
az role assignment create \
--role "Key Vault Secrets User" \
--assigne "uai-id" \
--scope /subscriptions/<subscription-id>/resourceGroups/<rg-name>/providers/Microsoft.KeyVault/vaults/kv-aks
```

- Création d'un service account kubernetes
```
apiVersion : v1
kind: ServiceAccount
metadata:
  annotations:
    azure.workload.identity/client-id : <uai-id>
  name: workload-identity-sa
  namespace: worload-identity
```

- Configuration de la fédération d'identité
```
az identity federated-credential create \
--name federateIdentity \
--identity-name uia-aks \
--issuer https://francecentral.ioc.prod-aks.azure.com/
--subject system.serviceaccount:workload-identity:workload-identity-sa \
--audience api://AzureADTokenExchange
```

- Configuration du pod pour utiliser le service account
```
apiVersion: v1
kind: Pod
metadate:
  name: workload-identity-test
  namespace: workload-identity
  labels:
    azure.workload.identity/use: "true"
spec:
  serviceAccountName: workload-identity-sa
  containers:
    - image: ghcr.io/azure/azure-workload-identity/msal-go
      name: oidc
      env:
      - name: KEYVAULT_URL
        value: https://aks-vault.vault.azure.net/
      - name: SECRET_NAME
        value: test-secrte
  nodeSelector:
    kubernetes.io/os: linux
```

- Vérification du bon fonctionnement
```
kubectl logs workload-identity-test -n workload-identity
```