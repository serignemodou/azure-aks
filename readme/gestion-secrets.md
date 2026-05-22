# Gestion des secrets
Cette page à pour objectif de décrire le fonctionnement des secrets au sein du cluster et la récupération de ceux-ci depuis le key vault Azure.

## 1 Général
Lorqu'une application a besoin d'accèder à des ressources Azure supportant le RBAC, elle utilise la fonctionnalité __d'authentification Entra Workload ID__ lui permettant ainsi de s'authentifier via une identité mmanagée.

Par contre pour accéder à nos propres ressources ou services ne supportant pas une identité managées, l'application à toujours besoin de s'authentifier en utilisant des credentials ou des clés.

La bonne pratique est, bien sur, de stocker ces secrets dans un coffre-fort digital.
Bien entendu dans Azure, c'est à dire le service Key Vault qui va jouer ce role.

Ainsi quand les applications ont besoin de credentials, elles vont récuoerer via ce coffre-fort, les secrets et ensuite se connecter au service cible.

![alt text](../media/vault.jpg)

Pour faciliter l'accès des applications aux différents secrets stockés dans le key vault, le cluster AKS propose le provider __Secrets Store CSI driver__.

Le but de ce provider est de récupérer le contenu de secrets depuis un Key Vault (Key / Secrets / Certificates) et de les mettre à disposition d'un pod sous la forme d'un montage de volume.
Ces secrets pourront également etre stockés sous forme de secrets kubernetes et ainsi etre accessible par d'autres pods au sein du meme namespace.

Pour utiliser le secrets Store CSI driver, il est nécessaire d'activer le addon correspondant, Cettt activation peut se faire à la création du cluster ou sur un cluster existant.

L'activiation de ce addon entraine la création d'une identité managée nommée __azureKeyVaultSecretsProvider-xxx__ qui pourra etre utilisée pour accèder au Key Vault.
Cette identité managée est crée dans le meme ressource groupe que celui des nodes et est assignée automatiquement à la VMSS.
On ne peut pas empecher la création de cette identité mais on peut choisir de l'utiliser ou pas.

L'accès au Key Vault (dans le cadre Secrets Store CSI driver) peut se faire via 3 méthodes différentes
- à l'aide d'un service-connector qui se charge de tout configurer pour nous au niveau d'azure (role RBAC sur le key vault, utilise l'identité crée autmatiquement, ...)
- en utilisant le Workload Identity
- en utilisant une identité managée créée spécifiquement et associée à la VMSS ou ciblant une VM en particulier.

## 2. Mise en oeuvre
Mise en oeuvre de la méthode _Workload Identity_
- Activer l'addon Secrets Store CSI driver sur le cluster
- Activer l'OIDC et workload identity sur le cluster
- Créer une identité managée dédiée au pod qui ve accéder au Key vault
- Assigner les roles nécessaires à cette identité pour accèder au Key VAult
- Créer un service account kubernetes
- Fédérer le Service Account Kubernetes avec l'identité managée dédiée
- Créer une ressource SecretProviderClass qui va définir la configuration de connexion au Key Vault et les secrets à récuprer.
- Déployer un pod qui utilise le SecretProvider pour récuperer les secrets depuis le Key Vault

1. Exemple
- Activer l'addon Secrets Store CSI driver
```
az aks enable-addons \
--name aks-cluster \
--resource-groupe rg-aks \
--addons azure-keyvault-secrets-provider
```

- Pour les 5 étapes suivantes, se référer à la page Authentication (OIDC issuer / Workload Identity)
- Création d'un SecretProviderClass
```
apiVersion: secrets-store.sci.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: azure-kv-csi
  namespace: ns-csi-identity
spec:
  provider: azure
  parameters:
    usePodIdentity: "false"
    clientID: <client-id-managed-identity>
    keyvaultName: kv-aks
    objects: |
      array:
        - |
          objectName: secret-1
          objectType: secret
        - |
          objectName: key-1
          objectType: key
        - |
          objectName: cert-1
          objectType: certificate
    tenantid: "tenant-id"
  secretObjects:
  - data:
      - key: secretvalue
        objectName: secret-1
    secretName: foosecret
    type: Opaque
```

- Déploiement d'un pod avec récupération des secrets présents dans le key vault et création d'un secret kubernetes

```
apiVersion: v1
kind: Pod
metadata:
  name: test-secret
  labels:
    azure.workload.identity/use: "true"
  namespace: ns-csi-identity
spec:
  serviceAccountName: "sa-csi-identity"
  containers:
  - name: ubuntu
    image: ubuntu:20.04
    command: ["/bin/bash, "-c", "--"]
    args: ["while true; do sleep 30; done;"]
    volumeMounts:
    - name: secrets-store01-inline
      mounthPath: "/mnt/secrets-store"
      readOnly: true
    env:
    - name: SECRET_DATA
      valueFrom:
        secretKeyRef:
          name: foosecret
          key: secretvalue
  volumes:
    - name: secrets-store01-inline
      csi:
        driver: secrets-store.csi.k8s.io
        readOnly: true
        volumeAttributes:
          secretProviderClass: "azure-kv-csi"
```

- Vérification que le pod est bien déployé et que les secrets sont bien récupérés.
```
kubectl get pod -n ns-csi-identity

# Vérifier si le secret kubernetes a bien été crée et contient la valeur ddu secret du key vault
kubectl get secret foosecret -n ns-csi-identity -o jsonpath='{.data.secretvalue}' | base64 --decode

# Vérifier que la variable d'environnement est bien alimenter avec la valeur du secret kubernetes
kubectl exec -it test-secret -n ns-csi-identity -- env | grep SECRET_DATA
```

## 3. External Secrets Operator
L'External Secret Operator (ESO) est un projet open source qui permet de synchroniser les secrets d'un coffre-fort difital (comme Azure Key Vault) avec des secrets kubernetes.
Cela permet aux applications déployées sur AKS d'accéder facilement aux secrets stockés dans Azure Key Vault sans besoin de charger un pod pour que les secrets soient disponibles.

L'ESO fonctionne en créant des ressources personnalisées kubernetes CRD qui définissent comment les secrets doivent etre synchronisés.

Voici les étapes pour utiliser l'ESO avec Azure Key Vault pour mettre à disposition un secret kubernetes de type docker-registry pret à l'emploie:
- Installation de l'ESO

L'installation dans le cluster AKS peut se faire en utilisant Helm.
```
kubectl create namespace external-secrets

helm repo add external-secrets https://charts.external-secrets.io
helm repo update

helm upgrade --install external-secrets external-secrets/external-secrets \
--namespace external-secrets \
--wait
```

Vérification de l'installation
```
kubectl get pods -n external-secrets
kubectl api-resources | grep external-secrets
```

- Création d'une identité managée Azure
```
az identity create \
--resource-group rg-aks \
--name uai-sa-federated \
--location francecentral
```

- Assignation des droits qui vont bien à l'identité
```
az role assignment create \
--role "Key Vault Secrets User" \
--assigned <uia-id> \
--scope /subscriptions/<subscriptions>/resourceGroups/rg-aks/providers/Microsoft.KeyVault/vaults/kv-aks
```

- Création d'un Service Account Kubernetes
```
apiVersion: v1
kind: ServiceAccount
metadata:
  annotations:
    azure.workload.identity/client-id: uia-client-id
  name: eso-controller
  namespace: external-secrets
```

- Configuration de la fédération d'indentité
```
az identity federated-credential create \
--name federateIdentity \
--identity-name uai-sa-federated \
--resource-group rg-aks \
--issuer https://francecentral.oic.prod-aks.azure.com/ \
--subject system:serviceaccount:external-secrets:eso-controller \
--audience api://AzureADTokenExchange
```

- Création des secrets dans Key Vault: registry-server, registry-username, registry-password
- Création de secret SecretStore ou ClusterSecretStore en fonction de la porte que l'on veut donner à notre secret kubernetes (namespace spécifique ou cluster-wide)

```
apiVersion: v1
kind: ClusterSecretStore
metadata: 
  name: azure-kv
spec:
 provider:
   azurekv:
     vaultUrl: "https://kv-aks.vault.azure.net"
     authType: WorkloadIdentity
     tenantId: <tenant-id>
     serviceAccountRef: 
       name: eso-controller
       namespace: external-secrets
```

- Création d'une ressource ExternalSecret qui va définir les secrets à synchroniser et la manière dont ils doivent etre stockés dans kubernetes
````
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: nexus-registry-config
  namespace: ns-secrets
spec:
  referehInterval: 1h
  secretStoreRef:
    name: azure-kv
    kind: ClusterSecretStore
  target:
    name: nexus-registry-config
    creationPolicy: Owner
    template:
      type: kubernetes.io/dockerconfigjson
      engineVersion: v2
      data:
        .dockerconfigjson: |
         {
            "auths": {
                "{{ .server }}" : {
                    "username": "{{ .username }}",
                    "password": "{{ .password }}",
                    "auth": "{{ printf "%s:%s" .username .password | b64enc }}"
                }
            }
         }
  data:
    - secretKey: server
      remoteRef:
        key: registry-server
    - secretKey: username
      remoteRef:
        key: registry-username
    - secretKet: password
      remoteRef:
        key: registry-password
```

- Utilisation du secret kubernetes pour puller les images dépuis Nexus lors du déploiement des pods
```
apiVersion: v1
kind: Pod
metadata:
  name: test-registry-secret
  labels:
  namespace: ns-secrets
spec:
  containers:
  - name: ubuntu
    image: ubuntu:20.04
    command: ["/bin/bash, "-c", "--"]
    args: ["while true; do sleep 30; done;"]
  imagePullSecrets:
    - name: nexus-registry-config
```

- Vérification que le pod est bien déployé
```
kubectl get pod -n ns-secrets
```