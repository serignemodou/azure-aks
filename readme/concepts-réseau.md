# Concepts réseau
Cette page à pour objectif de décrire les mécanismes réseau AKS.
Elle s'appuie sur la documentation officielle Azure concernant les concepts réseau AKS et les modèles CNI

## 1. Documentation officielle 
- [Networking concept for applications in AKS ]()
- [Baseline architecture for an Azure kubernetes service cluster]()
- [Architecture strategies for networking and connectivity]()
- [Azure container network Interface (CNI) Pod subnet]()
- [AKS Networking Update - Control Plan, Nodes and pod networkning options]()

## 2. Modèles Réseau AKS
AKS repose sur azure CNI.
Il propose plusieurs modèles d'allocations et de routage réseau, complètés par l'intégration du dataplane Cilium, qui repose sur eBPF.
Microsoft documente deux familles principales de modèles réseau recommandés:
- Azure CNI (Flat Network): Les pods peuvent etre joins directement vie leur propre IP (IP routable en déhors de AKS)
- Azure CNI Overlay Network: Plages CIDR logique séparées pour les Pods

Cilium, peut etre utilisé, ce qui crée deux autres options
- Azure CNI Poweredby Cilium
- Azure CNI Overlay Powered by Cilium

![alt text](../media/cilium.png)
Cilium apporte les fonctionnalités suivantes
- Fonctionnalités équivalentes aux plugins Azure CNI et Azure CNI Overlay existant
- Routage des services amélioré (remplace kube proxy)
- Application plus éfficaces des stratégies réseau (Network policy niveau L3, L4, L7, DNS)
- Meilleure visibilité du trafic du cluster AKS (Network Trafic Monitoring)
- Prise en charge des clusters plus importants (davantages de nodes, de pods et de services) (CIDR POD & Node différent)

Le modele réseau suivant est une adaptation moderne de Azure CNI Node Subnet:
- Azure CNI Pod Subnet
Notons que les familles suivantes sont dites legacy:
- Azure CNI Node subnet
- Kubenet

## 3. A propos de Overlay Network (Encapsulation Routing Mode)
Ci-après un schéma qui permet de mieux comprendre que le overlay Network permet de faire en sorte que les IPs des Pods ne sont pas partagée avec le Virtual Network (le subnet) sur lequel sont déployés les nodes.

![alt text](../media/network_overlay.png)

Un CIDR réseau différent du CIDR des nodes est mis en place.
Une translation réseau (NAT), pour les communications externe (Pod -> Cluster Outside (Azure Service, On-premise, Public Internet)).

Le mode de routage encapsulation utilise deux protocoles:
- VXLAN (8472/UPD)
- geneve (6081/UPD)

## 4. A propos de Overhead Overlay
Dans un réseau Overlay, les paquets des Pods ne sont pas routés directement dans le réseau physique (le Virtual Network Azure).
Ils sont encapsulés dans un autre paquet réseau pour etre transportés à travers l'infrastructure sous-jacente (Vxlan ou geneve).
Cela revient à créer un réseau virtuel "par défaut" le Virtual Network Azure.

L'Overlay permet de:
- Donner les IPs aux Pods dans une plage totalement indépendantes du Virtual Network
- Maximiser la scalabilité (jusqu'à des milliers de Pods sans risque d'épuiser les IPs Azure)
- Simplifier la gestion du réseau, en délégeant certaines taches aux CNI Cilium.

Mais pour cela, AKS doit transporter les paquets Pod -> Pod ; Pod -> Node dans un tunnel réseau.

L'Overlay implique donc:
- Une encapsulation des paquets
    - Un paquet IP "Pod -> destination" est intégré dans un autre paquet IP "Node -> Node"
- Des traitements supplémentaires. Chaque node du cluster doit:
    - encapsuler un paquet en sortie de Pod
    - lui attribuer une enveloppe réseau compatible avec l'infrastructure
    - l'envoyer au bon Node
    - le décapsuler a l'arrivé
    - puis le remettre au Pod cible

Ces étapes nécessitent du CPU + du traitement Kernel (Augmente un peu la latence)

Cela implique ce que l'on appelle l'Overhead Overlay: Un couts supplementaire qui impacte le delai de transit des paquets réseau.


## 5. Azure CNI 
    1. Azure CNI Overlay
    ℹ️ Description:
    Les pods reçoivent une IP issue d'un CIDR logique distinct du Subnet Azure, via une Overlay Network

    ✅ Avantages:
    - Economie d'adresse IP - les Pods ne consomment pas d'IP du Virrtual Network
    - Trés scalable
    - Gestion d'adressage simplifiée

    ⚠️ Limitations
    - Overhead réseau lié à l'Overlay (Entete supplémentaire augementant le délai de traitement des demandes)
    - Dépannage plus complexe
    - Performances moindres qu'avec un dataplane eBPF

    💡 Cas d'usage recommandés
    - Très grands Clusters
    - Contraintes IP strictes
    - Simplification IPAM

    | DataPlane | Routing Mode | Protocole |
    |:------------:|:-----------:|:----------:|
    | Azure CNI | Encapsulation | VXLAN , Geneve|

    2. Azure CNI Powered by Cilium
    ℹ️ Description
    _(CNI natif + eBPF)_
    Les POds utilisent des IPs du Virtual Network Azure directement.
    Le dataplane est Cilium (eBPF)

    eBPF remplace _iptables + kube-proxy_. Le dataplane est ainsi plus rapide, plus direct et plus prédictible.
    Ce modèle est aujourd'hui fortement reecommandé en remplacement de Azure CNI Natif.

    Il supporte le mode de routage: Encapsulation et Routing native

    ✅ Avantages:
    - Haute performance réseau grace au dataplane eBPF
    - NetworkPolicies accélérées et avancées: Les règles sont exécutées directement dans le kernel linux grace à eBPF
    - Obervabilité avancée : visibilité complète sur le comportement du réseau et des workloads

    ⚠️ Limitations
    - Forte consommation d'IP du Virtual Ntework
    - Dépendance aux capacités eBPF du kernel Azure
    - Compatibilité à surveiller selon les release

    💡 Cas d'usage recommandés
    - Performances maximales
    - eBPF
    - Observabilité
    - Routage Virtual Network direct

    | DataPlane | Routing Mode | Protocole |
    |:------------:|:-----------:|:----------:|
    | Cilium (eBPF) | Encapsulation or Native Routing | VXLAN , Geneve|

    3. Azure CNI Overlay Powered by Cilium
    ℹ️ Description
    _(Overlay + eBPF)_
    Il s'agit ici d'une solution qui ajoute l'Overlay à la solution précédente (Azure CNI Powered by Cilium (CNI natfi + eBPF)).

    eBPF remplace iptable + kubeproxy. Le dataplane est ainsi plus rapide, plus direct et plus prédictible.
    L'Overhead Overlay est réduit grace à la compilation des règles réseau en programmes eBPF

    Cette solution combine:
    - Adressage Overlay (pas d'IP du Virtual Network consommées)
    - Dataplane eBPF Cilium

    Il supporte le mode de routage: Encapsulation uniquement.
   
    ✅ Avantages:
    - Scalibilité
    - Performances supérieures à l'Overlay clasique
    - NetworkPolicies accèlérées vie eBPF
    - Obervabilité Cilium

    ⚠️ Limitations
    - Overhead Overlay toujours présent (mais réduit par rapport à la solution 1.2 Azure CNI Overlay)
    - Plus complexe (overlay + dataplane avancé)
    - Moins performant que le Cilium en CNI natif

    | DataPlane | Routing Mode | Protocole |
    |:------------:|:-----------:|:----------:|
    | Cilium (eBPF) | Encapsulation | VXLAN , Geneve|

    4. Azure CNI Pod Subnet
    ℹ️ Description
    Azure CNI Pod Subnet est un des modèles réseaux modernes recommanndés par Microsoft pour AKS. Dans ced mode, les Pods obtiennent leurs adresses IP depuis un subnet dédié aux Pods, distinct du subnet utilisé par les Nodes. Ce modèle permet une séparation claire des flux, tout en conservant un routage direct L3 au sein du Virtual network. 
    Deux modes d'allocation son supportés:
    - Dynamic IP Allocation : Les IPs sont attribuées dynamiquement aux pods depuis le subnet, améliorant l'éfficacité et réduisant le gaspillage d'adresses.
    - Static Clock Allocation : Des blocs IP sont réservés par Node Pool (cas d'usage avancé)

    ✅ Avantages
    - Haute performance réseau : Les Pods reçoivent des IPs directement routables dans le virtual network sans encapsulation overlay.
        - Cela assure un trafic natif L3 performant
    - Séparation claire entre Node et Pods : Les Pods disposent de leur propre Subnet, distinct du Subnet des Nodes
        - Meilleure isolation
        - Politiques NSG plus granulaires possible
    - Meilleure efficacité d'adressage : Contrairement au CNI node subnet, les IP ne sont pas prè-reservées statistiquement par node.
        - La Dynamic IP Allocation améliore fortement l'utilisation des IP
    - Scalabilité améliorée et flexible : Pods et Nodes peuvent évoluer indépendamment l'un de l'autre.
        - Plusieurs Node Pools peuvent utiliser un meme Pod subnet, ou des subnets Pod séparés
    - Compatibilité avec les Network Policies : Azure CNI Pod Subnet fonctionne avec Azure Network Policies et Calico
    - Routage direct sans SNAT : Les pods étant des IPs du Virtual Network, auncun SNAT n'est nécessaire pour le trafic sortant. 

    ⚠️ Limitations
    - Planification IP nécessaire : Il faut prévoir un subnet dédié aux Pods, une taille suffisante pour les workloads + croissance e éviter les conflits d'adressage dans le virtual network
    - Redimmensionnement complexe : Comme pour tout subnet azure, un subnet npeut pas etre agrandi facilement et une mauvaise taille initiale peut nécessiter une migration ou reconstruction. 
    - Besoin d'un environnement réseau bien maitrisé : Le modele nécessite un virtual network compatible, de bonne pratiques de peering et une attention particulière aux règles NSG ou appliance réseau.
    Non compatibilité avec tous les cas d'usage avancés : Exposition de service via Private Link Service au travers d'un service Load Balancer n'est pas supportée en mode "Static Block Allocation". 

    💡 Cas d'usage recommandés
    - Environnement entreprise nécessitant routage direct L3 dans un Hub & Spoke
    - Plateformrs AKS nécessitant séparation Pods/Nodes au niveau réseau (séparation de flux)
    - Clusters nécessitant un control NSG avancé par Node pool
    - Besoin d'un CNI natif mais sans les limites au modèle lagacy Azure CNI Node Subnet.

## 6. Planification du plan d'adressage IP
    1. Pré requis
    Avant de faire le choix d'un modèle / plugin réseau pour AKS vous devrez anticiper vos besoin notamment en termes de nombres d'IP
    - Estimation de la taille maximale du cluster
        - Calculez le nombre maximal de Nodes et de Pods prèvus.
        - Exemple : 10 Nodes x 30 Pods par node = 300 adresses IP de pod nécessaires, plus les adresses IP des Nodes (10) soit 310 adresses IP
    - Dimensionnement du subnet 
        - Utilisez un subnet suffisamment grand pour acceuillir toutes les adresses IP des Nodes et des Pods
        - Azure recommande un subnet /16 ou /17 pour les clusters de la production
        - Eviter d'utiliser de petits subnets (par exemple /24), sauf pour les tests
    - Subnets séparés
        - Utilisez des subnets dédiés pour les pools de nodes AKS
        - Isolez les node pools système et utilisateurs pour des raisons de sécurité et de facilité de gestion (teint toleration)
    - Eviter les chevauchements d'adresses IP
        - Assurez-vous que votre subnet AKS ne chevauche pas à d'autres réseaux virtuels locaux ou VPN
    - Anticiper la croissance future
        - Prévoyez de la marge pour l'extension des node pools et l'ajout de nouveau services. 
    
    2. Mise à jour de Cluster ou de Node
    Lors de la mise à jour des versions de kubernetes ou des Nodes, AKS peut temporairement augmenter la taille de votre pool de node afin de garantir la disponibilité.

    Cela entraine la création de Nodes supplémentaires (temporairement), chacun nécessite son propre ensemble d'adresses IP pré-allouées pour les Pods.

    Si votre Subnet dispose d'un nombre lilmité d'adresse IP disponible, cette augmentation temporaire peut provoquer une situration du pool de node, entrainant des échecs de mise à niveau ou des problèmes de planification. 

    Pour éviter cela, assurez-vous toujours que votre subnet inclut une réserve d'adresses IP supplémentaire afin de prendre en charge l'augmentation de capacité liée aux mises à niveau. 

    Lors d'une mise à jour (kubernetes version, node image ou OS), AKS crée un node pool temporaire (le nombre est défini dans le maxSurge), y déplace les pods trouvant dans le node à mettre à jour (drain), mettre à jour le node, et ramène les pods sur le node, et supprime le node temporaire. 

    3. Adressage IP en flat vs Overlay Networking
        - Flat Nteworking (Azure CNI Pod Subnet)
        Il est essentiel de bien planifier la taille du subnet afin d'acceuillir les adresses IP des nodes et des Pods.
        Chaque Pod reçoit une adresse IP du réseau virtuel: le subnet doit donc etre suffisament grand pour gérer le nombre de Pods prévu.

        Exemple: Si vous prévoyez 100 Nodes avec 30 Pods chacun, vous aurez besoin d'un subnet dont le CIDR est /20 (4096 adresse IP - 3) pour vos Pods, afin d'éviter la saturation et de permettre la scalabilité horizontale pour les mise à niveau et la maintenance. 

        - Overlay Networking (Azure CNI Overlay ou Cilium)
        L'Overlay Networking utilise un CIDR de superposition distinct pour les Pods, qui peut etre beaucoup plus grand que le réseau virtuel.

        Cela réduit le besoin de grands subnet dans les réseau virtuel, car les Pods ne sont pas directement routable depuis celui-ci.

        Exemple: Vous pouvez utiliser un CIDR de superposition /16 pour les Pods, ce qui permet d'avoir jusqu'à 65536 adressse IP de Pods sans impacter la taille du réseau virtuel.

## 7. Tableau Comparatif des modèles réseaux modernes
| Criètes | Azure CNI Overlay | Azure CNI Powered by Cilium (CNI Natif) | Azure CNI Overlay Powered by Cilium | Azure CNI Pod Subnet |
|:-------:|:-------:|:---------:|:------:|:-------:|
| Allocation IP| CIDR logique (pas dans le Virtual Network) | IP Virual Network Azure | CIDR logique | IP depuis un Subnet dédié du VNET |
| Dataplane | kube-proxy | Cilium eBPF | Cilium eBPF | kube-proxy ou Ciluim selon la configuration |
| Performance | Moyenne | Excellente | Très bonne | Haute performance (routage direct L3) |
| Consommation IP Virtual Network | Faible | Forte | Faible | Moyenne (Pod Subnet dédié, allocation dynamique efficace) |
| Scalabilité | Très élevée | Moyenne | Très élevée | Elevée (Pods et Nodes scalent indépendament) |
| Network Policies | iptables | eBPF | eBPF | iptables ou Cilium selon configuration |
| Complexité | Faible | Moyenne | Elevée | Moyenne (planification IP nécessaire) | 

## 8. Tableau comparatif pour le nombre maximum de Pods
En fonction du modèle réseau choisie, le nombre de Pods Maximum sera toujours de 250.
Le default maxPods peut varier.
| Modèle | Default maxPods | Max maxPods | Explication |
|:-------:|:-------:|:---------:|:------:|
| Kubenetes Pod CIDR | 110 | 250 | POD CIDR - Subnet logique |
| Azure CNI | 30 | 250 | IP pré allouées par Node et par Pod sur le meme subnet des nodes |
| Azure CNI Dynamic | 250 | 250 | Les IPs des Pods sont récupérées depuis un subnet séparé |
| Azure CNI Overlay | 30 | 250 | Pod CIDR - Subnet logique |  