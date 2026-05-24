# Observabilité
## 1. Métriques Azure Monitor
Les métriques du Control Plane sont fournies nativement via azure monitor. Cela permet d'avoir une visibilité sur:
- L'utilisation CPU / Mémoire du kube-apiserver
- L'utilisation de ETCD
- Les latences et les saturations du control Plane

Ces métriques permettent d'anticiper les saturations du control plane et d'éviter les crash du kube-apiserver.
Elles sont collectées à l'aide d'un server de métriques prèt à l'emploie déployé dans le namespace kube-system.

Il est recommandé de poser des alertes sur ces métriques. 
Par exemple:
- CPU API server > 60%
- Mémoire de l'api server en hausse brutale
- Usage élevé de la base etcd

## 2. Métriques non basées sur Azure Monitor
Ces services permettent de collecter des métriques supplémentaires qui ne sont pas disponible dans azure monitor.
1. Container insights
Container insights est une solution conteunerisée de l'agent azure Monitor pour collecter les journaux stdout/stderr et les évènements kubernetes sur chaque noeud du cluster.

2. Service Managé pour prometheus
C'est une solution de supervision entièrement managée compatible prometheus.
Ce service va collecter les métriques les métriques supplémentaires et les stocker dans un workspace azure monitor. 
Ces données pourront etre visualisées au travers de dashbord grafana mis à disposition par Azure dans une instance azure managed grafana.

La liste des métriques colléctées est disponible dans la documentation Microsoft.

3. Resource logs
A minima, les logs du control plane ci-dessous doivent etre collectées / envoyées vers un logs analytics workspace via un diagnostics settings.
- kube-apiserver
- cloud-controller-manager
- kube-scheduler
- cluster-autoscaler

Microsoft considère ces logs comme essentiels pour identifier les instances d'infrastructure.

4. Activity logs
Elles permettent de détecter des changements de configuration appliqué au niveau du cluster. 
Cela peut etre utilisepour suivre les modifications de version par exemple lorsqu'on décide d'activer l'auto upgrade.

Comme poue les logs de la ressource AKS, elles peuvent etre envoyées vers un logs analytics workspace pour analyse ou positionnement d'alertes.

5. Solutions Open source
- Prometheus
Collecte les métriques via des serveMonitor, et les stocke dans prometheus server
- OpenTelemetry
Collecte les métriques/logs/traces via des collecteur et les envoie vers des destinations différentes.