# Sécurité et gouvernance AKS
## Sécurité dans AKS
### 1. Defender
Il est possible de créer un profil Defender pour un cluster kubernetes. Ce profil va activer Microsoft Defender for container et apporte les fonctionnalité suivantes.

- Protection des images dans la registry: Déclanche automatiquement des scans d'image après chaque push ou import d'images. Peut faire des scans programmé (tous les 30 jours)
- Protection en runtime: déctection d'activités suspectes sur les node et les pools (élévation de privilèges, minage de cryptomonnaie, etc), avec génération d'alertes dans Defender
- Collecte de signaux du data plane depuis chaque node et envoie des logs vers Logs Analytics et Defender pour analyse
- Posture et conformité kubernetes : recommandations et remédiations sur les mauvaise configurations kubernetes
- Intégration avec la gestion des vulnérabilités des images : scanà l'upload et en continu

Ce qui est déployé lors de l'activation de la solution : 
- Un Defender Sensor, sous forme de DaemonSet sur chaque noeud du cluster, pour la collecte et l'analyse en runtime
- L'add-on Azure Policy pour évaluer et appliquer les règles de sécurité kubernetes
- Le cluster doit etre rattaché à un Log Analytics Workspace afin de stocker et traiter les événements. 

L'ensemble se configure au niveau de la souscription, et les couts induits peuvent etre élevés par rapport à l'infrastructure. D'autant plus que, pour une activation complète, les eléments suivants sont néécessaires :
- Cloud Workload Protection avec la partie Container activée : 6,8693 $ par vCPU et par mois
- Defender CSPM (Cloud Security Posture Management) : 5$ pâr ressources et par mois

Exemple: Avec AKS disposant un nodepool de 3 nodes en D4s_v5 (4vCPU) : 3 nodes x4vCPU x 6,8693 = 82,43$/mois en plus de CSPM