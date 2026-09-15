# Third-party notices

The root [MIT license](LICENSE) covers the AdLuv source and documentation. Dependencies, bundled third-party models, external content, and trademarks retain their own terms.

## Bundled Yarn release

`.yarn/releases/yarn-4.13.0.cjs` is the Yarn 4.13.0 CLI distribution. Its bytes were verified against the [official release artifact](https://repo.yarnpkg.com/4.13.0/packages/yarnpkg-cli/bin/yarn.js) during release preparation. Yarn is copyright 2016-present, Yarn Contributors, under the BSD 2-Clause license. The license from the [4.13.0 source tag](https://github.com/yarnpkg/berry/blob/%40yarnpkg%2Fcli%2F4.13.0/LICENSE.md) is retained in [licenses/yarn-4.13.0-BSD-2-Clause.txt](licenses/yarn-4.13.0-BSD-2-Clause.txt). Preserve it and the notices embedded in the CLI bundle when redistributing Yarn.

## Bundled OCR language models

`apps/worker/assets/tessdata/` contains gzip-compressed Tesseract fast models for German (`deu`), English (`eng`), French (`fra`), Italian (`ita`), Dutch (`nld`), Portuguese (`por`), and Spanish (`spa`). The model payloads match [tesseract-ocr/tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) and are licensed under Apache-2.0.

The upstream license is retained in [licenses/tessdata-fast-Apache-2.0.txt](licenses/tessdata-fast-Apache-2.0.txt). [Provenance and checksums](licenses/tessdata-fast-provenance.md) pin the upstream revision and document the byte-for-byte comparison. Preserve these notices when redistributing the models.

## Installed dependencies and native binaries

Dependency versions are recorded in `yarn.lock`; workspace manifests list direct dependencies. Preserve their upstream copyright and license notices when distributing installed packages or built applications.

The worker depends on [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static), which declares GPL-3.0-or-later for the package and downloads an FFmpeg binary during installation. The package's [documentation](https://github.com/eugeneware/ffmpeg-static#readme) identifies binary sources and requires checking each binary's license. FFmpeg licensing depends on the selected build; see [FFmpeg legal information](https://ffmpeg.org/legal.html). The AdLuv MIT license does not relicense those binaries or remove their distribution obligations.

Sharp/libvips, Tesseract.js, Playwright browsers, and other installed native/runtime components also retain their upstream licenses. Installed dependencies and downloaded browser/FFmpeg binaries are not checked into this source release.

## Advertising content and brands

The adapters collect data from third-party advertising libraries and landing pages. Collected ads, images, videos, logos, screenshots, and publisher content are not granted an MIT license by their appearance in the application. Access and redistribution rights must be established separately under applicable provider terms and content licenses.

The seed CSV is a list of company names and industry labels, not a license to collect or redistribute those companies' material. Third-party names and logos identify their respective owners and do not imply endorsement. Production databases, proxy credentials, and user-uploaded media are excluded from this source release.
