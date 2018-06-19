## 컴파일 이슈사항
```bash
npm WARN deprecated crypto@1.0.1: This package is no longer supported. It's now a built-in Node module. If you've depended on crypto, you should switch to the one that's built-in.
npm WARN deprecated jade@1.11.0: Jade has been renamed to pug, please install the latest version of pug instead of jade
npm WARN deprecated constantinople@3.0.2: Please update to at least constantinople 3.1.1
npm WARN deprecated transformers@2.1.0: Deprecated, use jstransformer
npm WARN notice [SECURITY] constantinople has the following vulnerability: 1 critical. Go here for more details: https://nodesecurity.io/advisories?search=constantinople&version=3.0.2 - Run `npm i npm@latest -g` to upgrade your npm version, and then `npm audit` to get more info.
npm WARN notice [SECURITY] uglify-js has the following vulnerability: 2 low. Go here for more details: https://nodesecurity.io/advisories?search=uglify-js&version=2.2.5 - Run `npm i npm@latest -g` to upgrade your npm version, and then `npm audit` to get more info.
```

## 아래와 같이 해결
- jade 를 pug 로 수정([참고](http://expressjs.com/ko/guide/using-template-engines.html))
- crypto가 deprecated됨에 따라 crypto.sha256를 사용하고 있는 로직에서  다른 모듈로 교체 필요

## 기능 수정
- 파트너 코드는 최고관리자(super user)가 승인프로세스 과정에서 발급해주는 형태로 구현할 것
- 승인된 파트너는 이후 공개키 등록 절차를 거침.