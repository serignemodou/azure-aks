# Upgrade AKS Cluster
Cette page à pour but de vous présenter la gestion et les paramètres d'upgrade d'un cluster Azure Kubernetes Service

La fonctionnalité d'upgrade AKS permet de maintenir un cluster dans une version sécurisée et supportée en mettant à jour successivement le control plan puis les nodes pools.

L'opération est orchestrée par Azure et se déroule généralement sans intérruption significative des workloads, à condition que ceux-ci soient préparés pour supporter des évictions controlées.

Avant de dérouler le process de migration, AKS effectue quelques vérifications en amont, notamment:
- Détection d'API dépréciées
- Vérification de la version
- Vérification de la configuration PDB (si maxUnavailable=0; pas d'upgrade)
- Vérification de la configuration maxSurge, pour savoir le nombre de node temporaire à créer (sur 3 nodes, maxSurge=33%, aks créera 1 node pendant l'upgrade)
- Valide le quota disponible par rapport au nombre de surge node voulus
- Vérifie si le subnet dispo suffisamment d'IP
- Vérifie les certificats et les SP pour détecter des droits expirés sur ces derniers

L'upgrade commence par la mise à niveau du control plane, qui peut occassionner une brève indisponibilité de l'API Kubernetes. 
Ensuite, Azure procède à l'upgrade des nodes pools au travers d'un rollinn update. Concrètement, Azure ajoute temporairement un noeud (ou utilse un "surge upgrade") afin de déplacer les pods, puis remplace chaque noeud un par un.
Cette approche garantit une continuité de service tant que les applications respectent les bonnes pratiques kubernetes.

__Bonne pratique kubernetes__
Bonne pratique pour eviter un arrèt de service lors de l'upgrade du cluster
- Garenti d'avoir au minimum 2 replicas pour chaque Pod, 
- Les deux réplicas ne doivent pas etre déployer en meme temps sur le meme noeud (podAntiAffinity, Topology Contraint)

Ci-après quelques définitions utiles pour comprendre le processus d'upgrade
- __Surge upgrade__: méthode d'upgrade ou des noeuds supplémentaires sont créés temporairement pour héberger les pods pendant la mise à jour des noeaud existants. Le paramètre lié est _maxSurge_ qui définit le nombre maximal de noeuds supplémentaires pouvant etre créer durant l'upgrade.
- __Cordon__ : Action qui marque un noeud comme non planifiable, empechant ainsi kube scheduler d'y placer de nouveau pod.
- __Drain__ : Processus qui évacue tous les pods d'un noeud. Respecte les __Pod Disruption Budget__ pour minimiser l'impact sur la disponibilité des application. 
- __PDB__ : Ressource kubernetes qui définit le nombre minimum de pods d'une application qui doivent rester disponibles lors d'opération de maintenance, telles que les upgrade de noeaud.
- __Delete__ : Suppression d'un noeud du cluster, généralement après que les pods ont été drainées et migrés vers l'autres noeud.

Le processus d'upgrade complet se déroule en plusieurs étapes
1. Provisionnement du noeud de remplacement (en utilisant maxSurge)
2. Cordon du noeud à upgrader
3. Drain du noeud (respect des PDB)
4. Reimage / Upgrade du noeud
5. Repeéter les étapes 2 à 4 pour chaque noeud du pool
6. Suppression des noeuds temporaires

## 1. Concernant l'auto upgrade
L'auto upgrade d'AKS permet de planifier des mises à jour automatique du cluster selon une fenetre temporelle définie et via plusieurs canaux.

1. Auto Upgrade du Cluster
- None : Aucune mise à jour automatiques n'est effectuée
- Patch : Mises à jour automatiques pour les versions patch (correctifs de sécurité, bugs), comme 1.20.x à 1.20.y
- Stable : Mises à jour automatiques pour les versions mineures stable (1.20 à 1.21)
- Planification : Permet de définir une fenètre hebdomadaire pour les mise à jour automatique via la configuration de aksManagedAutoUpgradeSchedule

2. Auto Upgrade des Images de OS
- None : Aucune mise à jour automatique n'est effectuée
- Unmanaged : Les mises à jour de l'image de l'OS sont gérées par l'OS (Ubuntu vui unattended-upgrade)
- Planification : Permet de définir une fenetre hebdomadaire pour les mises à jours automatiques via la configuration de aksManagedNodeOSUpgradeSchedule

3. Limitations
- L'upgrade ne peut pas sauter plusieurs versions mineures. Par exemple pour passer de la 1.19 à 1.21, il faur d'abord passer par la 1.20
- Le control plan peut subir de courtes indisponibilité pendant l'upgrade, notamment son API.
- Les extensions kubernetes installées doivent etre compatibles avec la version cible de l'upgrade, vérifiées et mise à jour séparément
- Il est impossible d'annuler une opération d'upgrade une fois qu'elle a commencée. Si des problèmes surviennent, il faut diagnostiquer et résoudre les problèmes avant de tenter une nouvelle mise à jour. 

## 2. Précautions et recommandations
Selon la documentation officielle d'Azure, voici quelques bonnes pratiques à suivre avant de lancer un upgrade AKS : 
- Toujours valider la version cible de l'upgrade sur un environnement de test pour s'assurer qu'elle est compatible avec les applications et extensions utilisées.
- Forcer une stratégie de déploiement avec des PDB bien définis pour minimiser l'impact sur la disponibilité des applications.
- Utiliser un surge upgrade pour garentir une continuité de service pendant l'upgrade
- S'assurer que les nodes pools gèrent correctement les ressources et que le cluster dispose suffisamment de capacité pour acceuillir les pods pendant l'upgrade.

Tous ces points permettent d'avoir un upgrade AKS moins risqué, et de pouvoir utiliser les services en cours d'upgrade avec un minimum d'impact.

Les risques inhérents à une opération d'upgrade sont les suivants
- Perte temporaire de traçabilité ou d'observabilité : redémarrage des agents de logs lors du remplacement des moeuds.
- Risque sur les données éphémères : disparition des donées stockés sur les disques temporaires lors d'un renouvellement de noeud.
- Risque opérationnel : perturbations des workflows non HA utilisation d'APIs Kubernetes dépréciées, ou readiness insufisante. 

Pour suivre un upgrade en CLI
```
az aks command invoke -g <rg-name> -n <aks-name> --command "kubectl get events"
```

## 3. Différence de gestion entre AKS Standard et AKS Automatic
Selon le mode  d'AKS choisi les manières d'upgrade ne sont pas les memes : 
- AKS Automatic : 
    - Azure gère kes upgrades control plan et data plane sans intervention manuelle
    - Possibilité de retarder une mise à jour
    - Il y a juste à definir une fenètre de maintenance, pour limiter l'impact des upgrades
- AKS Standard
    - Controle total avec version cible et fenètre de maintenance, planification et eécution des upgrades.

## 4. Recommandations IAC pour un cluster AKS Standard
Concernant les upgrades, il y a quelques paramètres permettant de configurer le comportement des upgrades

1. Canal d'auto-upgrade du cluster (la version de kubernetes)
Champ : _ManagedCluster.autoUpgradeProfile.upgradeChannel_
Valeurs : (type string)

- none : dèsactive l'auto-upgrade et garde le cluster dans sa version actuelle
- patch : upgrade automatiquement le cluster vers la version patch la plus recente en gardant la version mineure
- stable : upgrade automatiquement vers la version patch sur la version mineure N-1 ou N est la dernière version mineure supporter
- rapid : upgrade automatiquement vers la version patch sur la dernière version supportée.

Lzs paramètrages _patch_, _stable_, _rapid_ sont applicables uniquement si une fenètre de maintenance est active, configurable grace à la ressource _containerservice.MaintenanceConfiguration_

2. Canal d'auto-upgrade des Images OS des noeuds
Il n'est pas possible de downgrade la version d'une image de noeud. Si vous etes en AKSUbuntu2204, vous pouvez pas passer sur une AKSUbuntu-1804.

Champ : ManagedCluster : autoUpgradeProfile.nodeOsUpgradeChannel
Valeurs : (type string)
- none : Pas de mise à jour automatique de sécurité sur les OS des noeuds
- unmanaged : C'est l'OS qui gère les mises à jour de sécurité. Par exemple avec Ubuntu via unattended-upgrades une fois par jour à 06:00
- securityPatch : Désactive les mises à jour de l'OS et passe la mais à AKS pour gèrer de manière automatique, pour mettre à jour le VHD avec les dernières patches.
- NodeImage : AKS met à jour avec des nouveaux VHD patchés de manière hebdomadaire en respectant la fenètre de maintenance et les configurations de surge.

3. Paramètres d'upgrade des node pools
Champ : ManagedClusted.agentPoolProfiles.upgradeSettings[]
Membres:
- drainTimeoutInMinutes (type number) : Temps maximal accordé au drain d'un node avant de passer à suite de l'upgrade
- maxSurge : (type string) : Capacité supplémentaire créée pendant l'upgrade pour limiter l'impact de l'upgrade (en nombre ou pourcentage)
- maxUnavailable (type sting) : Nombre ou pourcentage de noeud pouvant etre simultanément indisponible durant l'upgrade
- nodeSoakDurationInMinutes (type number) : Période de stabilisation après qu'un noeud a été mis à jour et reintégré avant de poursuivre l'upgrade des noeuds suivants
- undrainbleNodeBehavior (Cordon ou Schedule) : Action à appliquer si un noeud est infrainble. Cordon le marque comme non-schedulable et continue l'upgrade. Le noeud reste dans le pool mais ne reçoit plus de pods. Schedule AKS ignore le cordon et continue à le planifier dans l'upgrade


## 5. Harmonie des paramètres selon l'horaire de l'upgrade
Il faut donc avoir une adéquation entre les différents paramètres : _maxSurge_, _maxUnavailable_, _drainTimeoutInMinutes_, _nodeSoakDurationInMinutes_, les PDB ainsi que les fenètres de maintenance pour que l'upgrade se fasse dans les temps et avec un niveau d'impact mesuré.

Tout dépendra s'il y a besoin que la solution hébergée continue à rendre service pendant l'upgrade. 
Dans ce cas, l'upgrade sera plus lons mais moins impactant pour les pods recevant du trafic.
Si c'est de nuit, et avecdes services hors-ligne, l'upgrade sera plus rapide et avec moins de précaution à prendre. 