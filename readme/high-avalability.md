# Hight Availability - Disater Recovery
## Hight Availability
Cette page à pour but, de décrire les mécanisme de haute disponibilté et de reprise après sinistre.
## 1. Architecture kubernetes
![alt text](../media/kubernetes-components.png)

## 2. Communication entre composants kubernetes
La haute disponibilité du control plane consiste à éviter qu'un composant maitre fasse tomber le cluster. 
1. Fonctionnement ETCD
- Sur un cluster de 3 nodes, il faut un quorom de 2 node pour avoir un cluster
- ETCD élu un leader via l'algorithme RAFT (pas maitre absolue, mais pour cordonner les opérations)
- Le leader reçoit les demandes d'écriture de l'api-server
- Il expose la demande dans _un entry log_ pour validation (votent) des etcd follower
- Si le quorom est atteint (2/3), le leader etcd accepte la demande d'écriture de l'api-server
- Les données seront répliquées dans les etdc followers
- Si le quorom n'est pas atteint (1/3), la demande est refusée (read-only)

2. Scheduler
- Surveille les pods non schedulés et l'état du clsuter sur l'api server via des Watcher
- Choisi un node en fonction des informations de capacité (cpu/mémoire), labels, taints,affinités, topology, etc remontées dans l'api server par les agents kubelet de chaque noeud.
- Une fois le node choisi, il assigne le Pod en mettant à jour me paramètre __nodeName__ nom du node
- Si deux schedulers tentent de modifier le meme pod simultanément, l'api server accepte la première modification, en utilisant un mécanisme de concurrence optimisé basé sur le paramètre __resourceVersion__, et renvoie un message __Resource has been modified__ au deuxième scheduler

3. API Server
Composant principale auquel on addresse les demandes (création, suppression, update) des objets sur le cluster
- Reçoit les demandes des utilisateurs 
- Réçoit l'état des nodes via les agents kubelet (les nodes, teint, ressoure cpu/memoire ...)
- Demande à l'agent kubelet d'appliquer les modifications sur les nodes
- Ecrire l'état de l'objet sur la base ETCD.

4. Controller manager
- Controller l'état réel et l'état désiré du cluster

5. Kubelet
- Agent principale kubernetes exécuter sur chaque node
- Commnunique avec l'api server pour surveiller les Pods assignés à son node et publie l'état du node et des pods à l'api server
- Recupère les informations du node (CPU, mémoire, état des pods, etc), et les remonte à l'api server
- Applique localement l'état désiré défini dans l'api server pour les pods assignés à son node
- Utilise le container runtime interface __(CRI)__ pour demander au container runtime de créer, supprimer, gèrer les containers
- Surveille également la santé des pods (Probe), gère les volumes/secrets et peut démarrer les containers en cas d'échec

## 3. Haute disponibilité 
1. Control plane
La haute disponibilité du controle plane permet d'avoir un cluster opérationnel meme si onn pert un master. 
- Choisir un nombre de master suppérieur ou égale à 3 , et impaire
- Placer les masters dans des zones de disponibilité différentes (data center différents)
- Utiliser un loadBalancer pour spliter le trafic entre les différents master

2. Data plane et Applications
- Placer les nodes dans des zones de disponibilité différentes
- Utiliser les __virtualMachineScalSet__ pour les node aks
- Teiter les nodes, pour controller l'emplacement de pods , __(teint, toleration)__
- Avoir au minimum deux réplicas pour chaque pods, les placer dans des nodes différents __(podAntiAffinity, topolgy)__
- Auto scaling horizontal des applications, __(keda)__

## Disater Recovery
## 1. Recupération d'un cluster après sinitre

## 2. Récupération des applications (statefull) après sinistre