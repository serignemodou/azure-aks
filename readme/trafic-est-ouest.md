# Trafic Est-Ouest
Cette page à pour object de décrire les mécanismes réseau AKS utilse pour analyszer les flux Est-Ouest: pod à pod

## 1. Général
Par défaut, tous les pods au sein d'un cluster AKS peuvent envoyer ou recevoir du trafic sans limitation aucune.

Donc, si on veut améliorer la sécurité, il est impératif de pouvoir controler et d'autoriser ou non les échanges entre les pods à l'aide de règles de communication. 

La définition de ces règles est possible grace à fonctionnalité Kubernetes __Network Policies__

## 2. Network Policies
Au travers de ces policies (manifest au format yaml) on défini de manière ordonnée les différentes règles d'envoie et de réception de trafic.

Ces règles sont appliquées (dans leur implémentation standard) sur une collection de pods via une sélection sur un ou plusieurs labels, un namespaces ou un bloc d'IPs.

Cette fonctionnalité peut-etre activée au besoin à la création d'un cluster ou sur un cluster existant.

## 3. Network Polices Engines
Azure permet d'utiliser un des 3 moteurs suivant pour les appliquer
- Cilium
- Azure Network Policy Manager
- Calico

| Moteur | OS supportés | Options réseau supportées | Types de policies | Capacités réseau avancées|
|:---:|:---:|:---:|:---:|:----:|
| Cilium | Linux | Azure CNI | Ingress, Egress | Filtrage via FQDN, L3/4 via eBPF, L7 inspection du contenu applicatif (header, paths, ...)|
| Azure NPM | Linux, Windows server 2022 | Azure CNI | Ingress , Egress | N/A |
| Calico | Linux, Windows Server 2022, 2019| Azure CNI, kubenete | Ingress, Egress | Enormément de fonctionnalité avancé, mais bon fonctionnement non garantit par AKS|

Microsoft recommande d'utiliser __Cilium__

## 4. Activation Azure CNI powered by Cilium
Il est possible de mettre à jour un cluster existant en Azure CNI powered by Cilium seulement si les critères suivants sont remplies:
- Le cluster utilise Azure CNI Overlay ou Azure CNI avec allocation dynamique d'IPs
- Azure Network Policy Manager (NPM), ou Calico ne sont pas déjà activés
- Le cluster ne possède pas de node pools Windows

Example:
```
az aks update --name aks-private-cluster --ressource-groupe rg-aks --network-dataplane cilium
```

## 5. Bonne pratiques
Comme avec toute fonctionnalité de controle et de filtrage de flux, la bonne pratique est que tout ce qui n'est pas défini explicitement comme autorisé est bloqué (default deny).

Donc il convient de:
- Définir une règle qui Deny all
- Définir des règles d'ouverture de flux des pods pour accéder à kube-dns / kube-apiserver.
- Définir des règles d'ouverture de flux applicatifs selon les besoins.

## 6. Chiffrement du trafic (Wireguard)
Depuis Septembre 2025, AKS propose la fonctionnalité de chiffrement en transit avec Wireguard avec pour object de chiffrer automatiquement le trafic réseau entre pods.

Cette fonctionnalité est intégrée dans Azure CNI powered by Cilium (via le bundle Advanced Container Networking Service).

Cependant le chiffrement n'est appliqué que pour le trafic entre pods situés dans des nodes différents (trafic qui quitte physiquement un node) sans besoin de modifier les applications.

Cette fonctionnalité complète les chiffrements existants au niveau VNET et TLS applicatif mais n'a pas vocation à les remplacer. 

L'activation se réalise en utilisant le flag enable-acns.
```
az aks update --name aks-cluster --resource-group rg-aks --enable-acns
```

