---
title: Huggingface Tokenizer 抽象整理
date: 2023-10-09
---

Huggingface Tokenizer 里面主要是两个东西：
- PretrainedTokenizerBase
  - Fast 和 Slow Tokenizer 都使用
- PretrainedTokenizer
  - Slow Tokenizer 使用

这里主要关注其它外部代码 (huggingface 里面的, 比如 Trainer 等) 是如何 call 过来的。

主要的路径有下面几条：
1. 直接调用 （也就是 `__call__`）
   ```
   __call__
   -> _call_one
     -> encode_plus
       -> _encode_plus
         -> get_input_ids
           -> tokenize
             -> _tokenize               # 把输入数据转化成 List[token string]
           -> convert_tokens_to_ids     # List[token_string] -> List[token_id]
             -> _convert_token_to_id_with_added_voc
               -> _convert_token_to_id  # 把 token string 转化成 token id
         -> prepare_for_model           # 准备 encoded_inputs 中的各种元素
                                        # 比如 input_ids, special_tokens_mask
                                        # attention_mask, position_ids 等
           -> num_special_tokens_to_add # 计算会增加的额外 token，比如 `[BOS]` `[EOS]`
             -> build_inputs_with_special_tokens # 具体的 Tokenizer 可能会 override 该方法
           -> pad                       # 这里可能是因为有具体的 PaddingStrategy 设置，
                                        # 也可能是因为 return_attention_mask == True
                                        # 对于后一种情况，该函数的输入是 BatchEncoding
                                        # 而非 List[BatchEncoding]
                                        # 对于 List[BatchEncoding]，pad 函数会在 pad 时
                                        # 转为 Dict[input_names, List[input_contents]] 
                                        # 来方便充当 PyTorch Dataloader 的 collate_fn
             -> _pad                    # 具体的 Tokenizer 可能会 override 该方法
   ```
   该路径会返回一个 BatchEncoding 对象，其基本上就是一个 Dict 的包装，Dict 中包括
   - `input_ids` (token id), e.g. `[1001, 2019, ...]`
   - `attention_mask` (0 is masked, 1 is normal), e.g. `[1, 1, 1, ...]`
   - `position_ids` (associated token position), e.g. `[0, 1, 2]`
2. pad 时被调用 (e.g. `DataCollatorWithPadding`)
   ```
   pad     # 这次输入是
           # [
           #   {'input_ids': [...], 'attention_masks': [...], ...},
           #   {'input_ids': [...], 'attention_masks': [...], ...}
           # ] 这种形式
   -> _pad # 这里只要处理 PaddingStrategy.MAX_LENGTH
           # 且已经 unpack 好，即每次只会输入单个 sample，Dict[str, Any] 形式

   ```

