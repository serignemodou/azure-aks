# Trafic Nord-Sud
💡 Objectif de cette page
Cette page a pour objectif de décrire les mécanismes réseau AKS utiles pour analyser et sécuriser les flux _Nord-Sud_:
- Flux depuis l'exetérieur vers les Pods (ingress)
- Flux depuis les Pods vers un système externe (Egress)

## 1. Documentation
- Ingress in Azure Kubernetes Service
- What is Application gateway Ingress Controller
- Customize cluster egress with outbound types in Azure kubernetes Service
- Securing Egress Traffic

## 2. Ingress - Flux externe --> Pods
Lors de la gestion du trafic applicatif, les controllers ingress offrent des fonctionnalités avancées grace à leur fonctionnement au niveau 7.

Ils peuvent acheminer le trafic HTTP vers différentes applications en fonction de l'URL entrante, permettant ainsi des règles de distribution du trafic plus intélligentes et flexibles.

Par exemple, un controller ingress peut diriger le trafic vers différents microservices selon les labels du services exposant le pods, améliorant ainsi l'éfficacité et l'organisation de vos services.

![alt text](../media/ingress-service.png)

En revanche, un service de type Load Balancer, lors de sa création, configure une ressource d'équilibrage de charge Azure sous-jacente.

Cet équilibreur de charge fonctionne au niveau 4, distribuant le trafic aux Pods de votre service sur le port spécifié.

1. Service type Load Balancer (L4)
ℹ️ Description
Création automatique d'un load balancer standard par Azure, exposant le service Kubernetes.

✅ Avantages
- Simple 
- Peu de composants
- Intégration Azure Native 

⚠️ Limitations
- Pas de logique L7
- Mutiplication d'IP Public (augementation du billing)

2. Ingress Controllers (L7)
Options possibles (Azure Natif ou open source (CNCF))
- Application Gateway Ingress Controller
- Managed NGINX - Application Routing Add-on
- Application Gateway for Containers
- NGINX Classique
- Kubernetes API Gateway

✅ Avantages
- Routage L7 avancé
- Terminaison SSL/TLS
- Réduction des IP publiques
- Intégration DNS possible

⚠️ Limitations
- Complexité accrue
- Latence potentielle
- Dépendance aux solutions choisies

3. Comparatif solution L7

| Critère | AGIC (Legacy) | Managed NGINX - Application Routing Add-on | Application Gateway for Containers | NGINX classique |
|:---:|:-----:|:-----:|:-----:|:-----:|
| Status - Maturité | Ancien, maintenance minimale | Solution managée moderne | ingress moderne cloud-natif | OSS ou entreprise |
| Modèle d'exécution | Application Gateway v1/v2 externe | Pods Nginx managés dans AKS | App Geteway externe au cluster | Pod NGINX dans le cluster |
| Types d'ingress | L7 via App gateway | L7 via NGNIX | L7 viaz App Gateway (moderne) | L7 via NGINX |
| Performances / Scalabilité | Scalabilité limitée (AGW) | Très bonne (HPA*) | Excellente (scale-out natif)| Très bonne |
| Fonctionnalités L7 | WAF v2, rewrite, routage | Rewrite,,annotations NGINX | WAF moderne, mTLS, routage avancé | Rewrite, mTLS, canary, avancé |
| Support WAF | Oui (WAF v2) | Non | Oui (WAF moderne) | Non natif |
| Support mTLS | Partiel | Oui | Oui | Oui |
| Exposition Publique | Oui | Oui | Oui | Oui |
| Expositon privée | Via private IP AGW | Via internal LB | Native (private Geteway) | via ILB |
| Compatibilité Private Endpoint | Bonne | Très bonne | Très bonne | Très bonnne |
| Intégration Azure IAM / Logs / Policies | Bonne | Très forte | Bonne | Excellente | Moyenne |
| Support Azure Policies | Oui | Oui | Oui | Limité |
| Simplicité d'opération / MCO | Moyenne | Très simple | Simple | Variable |
| Fit Hub & Spoke | Bon pour Nord/Sub | Très bon interne | Excellent | Très bon |
| Cout | Elevé (AGW) |Economique | Modéré | Très économique |
| Optimisé AKS | Non(legacy) | Oui | Oui (moderne) | Oui (générique) |
| Cas d'usage idéal| Héritage App GW + WAF | Ingress standard | Production moderne + WAF | Besoins custom/multi-cloud |


## 3: Egress - Pods -> Systèmes externes
Le comportement egress est défini par outboundType. Les options sont:
- LoadBalancer
- managedNatGateway
- userAssignedNatGateway
- userDefinedRouting (UDR)
- none / block

1. Loadbalancer
💡 Description
Le trafic sort via l'IP publique du Standard LoadBalancer

✅ Avantages
- Simple
- Automatique (option par défaut)

⚠️ Limitations
- Risque épuisement ports SNAT
- IP publique obligatoire

2. NAT Gateway (managed ou userAssigned)
💡 Description
Fournit un SNAT performant et scalable (dans le Hub)

✅ Avantages
- Haute capacité SNAT
- IP sortantes stables
- Recommandé en production

⚠️ Limitations
- Cout additionnel
- Gestion des ressources

3. User Defined Routes (UDR)
💡 Description
Routage vers un Firewall (Azure Firewall Appliance HUB)
Très pratique dans le cas d'une architecture HUB & SPOKE

✅ Avantages
- Controle complet du flux sortant
- Filtrage avancé, et application de politiques
- Journalisation

⚠️ Limitations
- Complexité
- Latence potentielle

4. None / Block
💡 Description
Environnements très isolés, pas accès à internet

✅ Avantages
- Sécurité maximale

⚠️ Limitations
- Très restrictif
- Configuration manuelle obligatoire

## 4. Sécurité Nord-Sud & Gestion du Risque
Le trafic Nord-Sub correspond aux flux franchissant une frontière vers un réseau potentiellement hostile.

Azure recommande:
- Segementation réseau (découpage du réseau en sous-réseau, du cluster en namaspace)
- Controles Ingress/Egress à plusieurs niveaux
- Defense-in-depth (NSG, Firewall, Policies Kubernetes)
- Limiter l'exposition aux réseaux externes

## 5. Synthèse - Tableaux Comparatifs
1. Ingress

| Solution | L4/L7 | Avantages | Limites |
|:---:|:---:|:---:|:----:|
| Load Balancer | L4 | Simplicité | Peu flexible |
| Nginx managé | L7 | SSL , DNS, KeyVault | Hébergé en cluster |
| App Gateway for Containers | L7 | WAF, SSL Offload | Complexité, dépendances|

SSLOffload : Le chiffrement/déchiffrement est géré par le proxy LoadBalancer
SSL PassThrough : Le chiffrement/déchiffrement est géré par l'application backend

2. Egress

| OutboundType | Description | Avantages | Limites |
|:---:|:---:|:---:|:----:|
| LoadBalancer | Egress via SLB | Simple | Risques SNAT |
| managedNatGateway | NAT géré | Haute capacité | Cout |
| userAssignedNatGetaway | NAT BYO | Controle IP | Gestion manuelle |
| UserDefinedRounting | Routage vers le Firewall | Sécurité | Complexité |
| none / block | Aucun egress | Sécurité max | Très restrictif |
