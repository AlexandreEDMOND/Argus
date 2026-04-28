# Argus

Console web locale d'inference pour des serveurs MLX lances a la main.

Argus ne demarre pas les modeles depuis la page web et ne tue aucun processus.
Le script unique `start.sh` sert a lancer, dans des terminaux separes, les
serveurs MLX et l'interface web.

## Modeles

Par defaut :

```bash
/Volumes/T7/models/parakeet-tdt-0.6b-v2
/Volumes/T7/models/Qwen3.5-0.8B
/Volumes/T7/models/Kokoro-82M-MLX
```

## Commandes

Depuis n'importe quel dossier, utilise le chemin absolu :

```bash
/Users/alexandre/CodePuant/Argus/start.sh commands
```

Terminal 1 - Parakeet ASR :

```bash
/Users/alexandre/CodePuant/Argus/start.sh parakeet
```

Terminal 2 - LLM :

```bash
/Users/alexandre/CodePuant/Argus/start.sh llm
```

Cette commande lance le serveur LLM minimal d'Argus, pas `mlx_lm.server`.
Le serveur officiel `mlx_lm.server` est evite ici car cette version plante dans
ses threads HTTP avec `There is no Stream(gpu, 0) in current thread`.

Terminal 3 - Kokoro TTS :

```bash
/Users/alexandre/CodePuant/Argus/start.sh tts
```

Terminal 4 - Argus web :

```bash
/Users/alexandre/CodePuant/Argus/start.sh web
```

Puis ouvre :

```bash
http://localhost:8000
```

Preload audio, si tu veux le faire en terminal au lieu de cliquer dans l'UI :

```bash
/Users/alexandre/CodePuant/Argus/start.sh preload
```

Le LLM n'a pas de preload separe : `start.sh llm` charge le modele au
demarrage. Dans l'UI, le bouton de chargement est donc desactive pour le LLM.

## Ports

- Argus web : `8000`
- Parakeet ASR : `8802`
- LLM : `8803`
- Kokoro TTS : `8804`

## Variables utiles

```bash
MODEL_ROOT=/Volumes/T7/models
PARAKEET_ASR_MODEL=/Volumes/T7/models/parakeet-tdt-0.6b-v2
LLM_MODEL=/Volumes/T7/models/Qwen3.5-0.8B
TTS_MODEL=/Volumes/T7/models/Kokoro-82M-MLX
TTS_VOICE=ff_siwis
PARAKEET_ASR_PORT=8802
LLM_PORT=8803
TTS_PORT=8804
PORT=8000
```

Exemple :

```bash
LLM_MODEL=/Volumes/T7/models/Qwen3.5-0.8B /Users/alexandre/CodePuant/Argus/start.sh llm
```

## Notes

`start.sh` utilise d'abord le binaire audio de `.venv/bin` s'il existe. Pour le
LLM, il lance `uvicorn src.llm_server:app` dans l'environnement uv du projet.
Cela permet de lancer les commandes meme depuis un autre dossier.
