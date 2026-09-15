# Bundled OCR language data

The seven `apps/worker/assets/tessdata/*.traineddata.gz` files are gzip-compressed copies of the [Tesseract fast language models](https://github.com/tesseract-ocr/tessdata_fast/tree/87416418657359cb625c412a48b6e1d6d41c29bd), licensed under [Apache-2.0](tessdata-fast-Apache-2.0.txt).

On 2026-09-15, every decompressed local payload was compared byte-for-byte with `{language}.traineddata` at upstream commit `87416418657359cb625c412a48b6e1d6d41c29bd` and matched. The compression wrapper is local packaging; the model payloads are unchanged. The original download date and compression command are not recorded.

| Language code | SHA-256 of decompressed `.traineddata` |
| --- | --- |
| `deu` | `19d219bbb6672c869d20a9636c6816a81eb9a71796cb93ebe0cb1530e2cdb22d` |
| `eng` | `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2` |
| `fra` | `ced037562e8c80c13122dece28dd477d399af80911a28791a66a63ac1e3445ca` |
| `ita` | `b8f89e1e785118dac4d51ae042c029a64edb5c3ee42ef73027a6d412748d8827` |
| `nld` | `ced0e5e046a84c908a6aa7accbef9a232c4a5d9a8276691b81c6ee64d02963f6` |
| `por` | `c4932b937207a9514b7514d518b931a99938c02a28a5a5a553f8599ed58b7deb` |
| `spa` | `6f2e04d02774a18f01bed44b1111f2cd7f3ba7ac9dc4373cd3f898a40ea6b464` |
