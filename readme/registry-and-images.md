# Registry et images
Cette page à pour but de vous présenter la gestion des registries et des images dans le cadre de l'utilisation d'Azure Kubernetes Service.

## 1. Consommation d'image par AKS
AKS dispose d'une intégration native d'ACR (Azure Container Registry). L'identité managée du kubelet (donc l'identité managée étant associée au node pool) peut etre autorisée à pull des images depuis un ACR attaché (role de lecture d'image).
Cela s'appuie sur Entra ID et évite d'utiliser des secrets Kubernetes.

ACR peut également faire des imports (mirroring) dépuis différents services comme DockerHub, Microsoft Container Registry ou des registre privées (comme Nexus) via différents moyens.

Exemple: Importer nginx dans ACR depuis dockerHub
```
az acr import \
--name <nom_de_acr> \
--source docker.io/library/nginx:1.25 \
--image mirrors/nginx:1.25
```

Azure CLI dispose de différentes fonctions pour vérifier différentes choses, notamment une vérification que l'AKS puisse joindre correctement l'ACR lui servant de registry:
```
az aks check-acr -g <rg-aks> -n <aks-name> -r <acr-name>
```

Il est aussi tout à fait possible d'attacher plusieurs ACR à un AKS, notammentvia une commande az cli:
```
az aks update -g <rg-aks> -n <aks-name> --attach-acr <acr-name>
```

Pour une registry externe comme Nexus par exemple AKS peut les consommer mais avec des mécanismes non spécifiques à Azure mais bien générique à kubernetes, donc via des objects de type _imagePullSecret_.
```
kubectl create secrte docker-registry my-registry-secret \
--docker-server=https://index.docker.io/v1/ \
--docker-username=$USERNAME \
--docker-password=$PASSWORD \
--docker-email=my-email
```

Ce secret sera référencé par les pods ou le Service Account ou namespace. 

## 2. Exposition réseau et isolation des registries
ACR permet d'exposer ses endpoints en privé via un private endpoint, en supplément à la désactivation de l'accès public.
La résolution DNS privée de _privatelink.azureacr.io_ permet de conserver l'usage du FQDN du registry tout en renvoyant une adresse privée.

La désactivation de l'accès publique peut etre forcer par une built-in policy.

Dans le cas d'une registry externe autre qu'ACR AKS requiert une visibilité réseau vers la registry via les moyens habituels comme un private endpoint.
Les possibilités d'isolation réseau (NSG, routes, etc) sont indépendantes d'AKS et doivent permettre le pull de l'artefact depuis les noeuds du cluster. 
Niveau gouvernance AKS, il est quand meme possible d'utiliser une policy permettant de restreindre les images aux registries autorisées.

## 3. Controle de la provenance des images
Azure met à disposition une Azure Built-in-policy nommée _Kubernetes cluster should only use allowed image_. Cette policy permet d'autoriser uniquement les images dont le registre matche une regex fournie. 
Cette politique peut aussi etre créer avec policies kubernetes (OPA, Kyverno).

## 4. Obervabilité et analyse des vulnérabilités niveau registry
Sur ACR, Microsoft Defender for Containers permet de scanner les images. Ce service déclenche des analyses lors des push et import et lorqu'une image est pullée dans 30 premiers jours et publiée dans les recommandations de rémédiation.

Si l'ACR est privée, il faut a minima que les node trusted services de Microsoft puissent l'atteindre pour effectuer les scans.

## 5. Policies Azure à étudier ou envisager
1. Pour le ACR
    - Configure Container registries to disable public network access
        - Eviter l'exposition externe des registries ACR (paramètre public network access)
    - Configure container registries to disable local admin account
        - Désactive le compte administrateur local de la registry pour forcer l'utilisation RBAC via Entra ID
    - Configure container registries to disable anonymous authentication
        - Forcer l'authentification et interdire les "anonymous pulls"

2. Pour AKS
- (Preview): Prevents containers from being ran as root by settings runAsNotRoot to true
    - Evite l'exécution de container an tant que root
- Kubernetes cluster containers should only use allowed images
    - N'autorise que les images provenant de registries explicitement approuvées
- Azure kubernetes service cluster should have Defender profile enabled
    - Forcer l'activation de Defender for Containers

Toutes ces policies AKS peuvent aussi etre créer avec OPA ou kyverno.

## 6. Image cleaner
Image Cleaner est une fonctionnalité de nettoyage automatique des images de container, stagnantes ou vulnérables.

Il identifie les images non utilisées, les scan à la recherche de vulnérabilité et les supprimes de manière automatisée tout en laissant quelques options pour controler son comportement.

Son fonctionnement est le suivant:
- L'activation de la fonctionnalité déploie un Pod controller nommé _ecraser-controller-manager_
- A chaque execution ce controller crée un worker par noeud du cluster qui contient 3 pods : 
    - collecteur qui recense les images non utilisées
    - triivy-scanner qui scan les images pour les vulnérabilités
    - remover qui supprime les images non utilisées et vulnérables.
- Une fois le nettoyage terminé, les pods workers sont supprimés
- Il attend l'intervalle configuré pour la prochaine exécution

Il dispose de deux modes d'utilisation : automatique et manuel.
Le mode automatique s'exécute selon un interval spécifique (par défaut tous les 7 jours). Le mode manuel est un peu plus complexe et nécessite de créer des ressources kubernetes de type _ImageList_. 

L'activation via az-cli se fait comme suit (168h correspond à 7 jours)

```
az aks update -g <rg-name> -n <aks-name> \
--enable-image-cleaner \
--image-cleaner-interval-hours 168
```

La désactivation est encore plus simple : 
``` 
az aks update -g <rg-name> -n <aks-name> --disable-image-cleaner 
```
