API Server
## Description
L'API server est le front end du contol plane du cluster. Toutes les communications entre les composants dans le cluster ou dépuis l'extérieur passent par cette brique.
Les échanges avec l'API server se réalisent au travers d'API Rest grace auxquelles il est possible de poster des commandes ou des fichiers YAML.
Au contraire, des cluster et node-pool qui sont déployée dans nos souscription, l'API server est, quand à lui, hebergé dans une souscription propre à Azure.

## 1. Intégration réseau
Afin de s'assurer que les échanges entre l'API server et les nodes se font exclusivement au sein d'un réseau privé, il est impératif de réaliser une vnet intégration (c'est à dire déléguer un subnet pour y intégrer le endpoint de l'API server).
Cette intégration peut etre réalisée pour les clusters publics et privés via 2 solutions possibles:
- Intégration dans un vnet complétement managé par Azure
- Intégration dans notre propre vnet (BYO vnet)
L'intégration réseau est préconfigurée par défaut dans un cluster AKS Automatic.

1. Bring-your-own vnet
L'intégration de l'API server se réalise dans un subnet délégué (Microsoft.ContainerService/managedClusters) d'une taille minimales en /28 (/27 recommandé). Cette délégation va permettre au service AKS d'y déployer les pods ainsi qu'un loadbalancer interne. 

Le cluster AKS reserve 9 IPs (utilisés par l'api server), 5 IPs réservés par Azure pour le management. Il est docn important de choisir une taille correcte car un manque d'IPs pourrait empecher le scaling de l'api server pouvant provoquer une intéruption du service. 

Etant donnée la délégation configurée sur ce subnet, il ne pourra etre utilisé pour héberger d'autres types de ressources mais pourrait etre mutualisé pour integrer les API servers d'autres clusters AKS au sein de la meme souscription.

L'intégration l'API server dans ce mode demandera également de créer un subnet qui recevra le node pool system.
Afin que le cluster puisse interagir avec ces subnets:
- Une identité manageée devra lui etre associée
- Le role Network Contributor assigné sur les 2 subnets pour cette identié

2. Securisation des accès 
__ACCES EN DEHORS DU CLUSTER__
Si le cluster est crée en mode public, l'API server est associé à une IP publique afin qu'il puisse etre accéder depuis internet. Dans ce cas il sera necessaire de configurer une liste d'IPs autorisées à accèder à l'API server.

Pour mieux sécuriser l'accès à l'API server, il est preferable de le déployé en mode privé. Dans ce cas, l'IP de l'api server sera une IP du subnet dans lequel il a été intégré. 

En mode privé, l'API server a besoin de créer un enregistrement DNS privée. Par defaut le cluster AKS crée une zone dns privée dans la souscription dans laquelle il a été déployé (cela pose des soucis de résolution si d'autres ressources en dehors de cette souscription souhaite y accèder). 
Donc pour que la résolution se passe correctement, il est requis d'utiliser la zone DNS privée centralisé private.location.azmk8s.io de la souscription hub  (IS Service Prod).

Pour que le cluster puisse utiliser cette zone dns privée, il est nécessaire d'assigner à UAI les roles suivants:
- le role Private DNS Zone Contributor sur la zone privée DNS
- le role Network Contributor sur le vnet qui contient le subnet utilisé pour l'intégration AKS

__Authentification et Autorisation__
Il est important de pas déployer le cluster avec la gestion de l'authentification et des autorisations positionnée sur l'usage des comptes locaux.
Si on enlève cette solution, il en reste les deux suivantes:
- Authentification Entra ID avec RBAC Kubernetes (option par défaut pour AKS Automatic)
- Authentification Entra ID avec RBAC Azure

Peut importe la solution choisie, on preferera donner les droits au niveau des groupes plutot qu'à l'utilisateur unitaire pour en simplifier la gestion. 

__RBAC Kubernetes__
Cette option permet de gérer les actions le plus finement possible, c'est à dire sur des scope de ressources kubernetes précis.
Mais cela necessite une gestion un plus complexe, car on doit alors gerer les roles et les roles binding au sein de AKS.
A l'activation de cette option, il ne faut pas oublier de définir le groupe qui sera admin du cluster afin de pas se retrouver bloqué.

__RBAC Azure__
Cette option s'incrit dans ce que l'on fait déjà pour les autres services azure: Assigner des roles directement à des ressources.
Meme si on ne peut aller aussi finement dans le scope qu'avec le RBAC Kubernetes, elle permet tout de meme d'assigner des roles au niveau du cluster et des namespaces. 

__Integration avec l'API server__
Pour intergir avec l'api server, on se sert de kubectl comme pour n'importe quel autre cluster kubernetes.
Par contre pour AKS, c'est le plugin kubelogin pour kubectl qui sera en charge de gèrer l'authentification auprès d'Entra ID.

3. Préconisation déploiement du cluster
Il est recommander de déployer AKS:
- En mode privé
- Avec intégration réseau
- Avec la gestion des droits Entra ID RBAC Kubernetes Activé

4. Exemple de déploiement d'un cluster avec AZ CLI
Ci-dessous les commandes az cli pour créer un cluster privé avec intégration réseau et utilisation de la zone DNS privée centralisée.
- Creation du cluster
```
az network vnet subnet create --resource-group rg-cloud-platform-network --vnet-name vnet-it-cloud-public-sandbox --name snet-aks-cluster --address-prefixes 172.24.132.0/25

az network vnet create --ressource-group rg-cloud-platform-network --vnet-name vnet-it-cloud-public-sandbox --name snet-aks-api-server --address-prefixes 172.24.132.128/28 --delegations Microsoft.ContainerService/managedClusters 
```
- Createion de UAI
```
az group create --name rg-trusting-aks --location francecentral

az identity create --ressource-group rg-trusting-aks --name uia-trusting-aks --location francecentral
```

- Assignation des roles
```
# Pour les subnets
az role assignment create --scope /subscription/<subscriptionId>/resourceGroups/rg-cloud-platfrom-network/provider/Microsoft.Network/virtualNetworks/vnet-it-cloud-public-sandbox/subnets/snet-api-server --role "Network Contributor" --assigned <uai-id>

az role assignment create --scope /subscription/<subscriptionId>/resourceGroups/rg-cloud-platfrom-network/provider/Microsoft.Network/virtualNetworks/vnet-it-cloud-public-sandbox/subnets/snet-aks-cluster --role "Network Contributor" --assigned <uai-id>

# Pour le vnet (on peut se passer des assignation du subnet, puiqu'il hérite celles du subnet)
az role assignment create --scope /subscription/<subscriptionId>/resourceGroups/rg-cloud-platfrom-network/provider/Microsoft.Network/virtualNetworks/vnet-it-cloud-public-sandbox--role "Network Contributor" --assigned <uai-id>

# Pour le private zone DNS
az role assignment create --scope /subscription/<subscriptionId>/resourceGroups/rg-service-privates-dns-zone-sandbox/providers/Microsoft.Network/privateDnsZones/private.francecentrale.azmaks.io --role "Private DNS Zone Contributor --assigned <uai-id>
```

- Déploiement du cluster privé
```
az aks create --name aks-foo-private \
--resource-group rg-trusting-aks \
--location francecentral \
--network-plugin azure \
--enable-private-cluster \
--enable-api-server-vnet-integration \
--vnet-subnet-id /subscription/<subscriptionId>/resourceGroups/rg-cloud-platfrom-network/provider/Microsoft.Network/virtualNetworks/vnet-it-cloud-public-sandbox/subnets/snet-aks-cluster \
--apiserver-subnet-id /subscription/<subscriptionId>/resourceGroups/rg-cloud-platfrom-network/provider/Microsoft.Network/virtualNetworks/vnet-it-cloud-public-sandbox/subnets/snet-api-server \
--assign-identity /subscription/<subscriptionId>/resourceGroups/rg-trusting-aks/provider/Microsoft.ManagedIdentity/userAssignedIdentities/uia-trusting-aks \
--tier standard \
--generat-ssh-keys \
--enable-aad \
--enable-azure-rbac \
--private-dns-zone /subscription/<subscriptionId>/resourceGroups/rg-service-privates-dns-zone-sandbox/providers/Microsoft.Network/privateDnsZones/private.francecentrale.azmaks.io
```