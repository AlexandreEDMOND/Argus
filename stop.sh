#!/bin/bash
screen -S web       -X quit 2>/dev/null && echo "web stoppé"
screen -S asr-demo  -X quit 2>/dev/null && echo "asr-demo stoppé"
screen -S vllm-qwen -X quit 2>/dev/null && echo "vllm-qwen stoppé"
screen -ls
