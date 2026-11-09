# নিরাপদ লগইন ও Google Sheet সংযোগ চালু করা

ওয়েবসাইটে এখন প্রতিটি private read/save/delete অনুরোধে সার্ভারের session যাচাই হয়। Google Sheet-এর Settings tab-এর password, browser sessionStorage বা client API secret দিয়ে আর লগইন হয় না। সার্ভারে configuration না থাকলে private API বন্ধ থাকে; public verification সফল দেখায় না।

## ১. নতুন স্থানীয় credentials তৈরি

Node.js 24 দিয়ে repository-র terminal-এ চালান:

```sh
node scripts/configure-security.mjs
```

নতুন পাসওয়ার্ড দুবার লিখুন। এটি পর্দায় দেখা যাবে না এবং plaintext হিসেবে ফাইলে রাখা হবে না। Script আলাদা random API/session secrets ও salted scrypt password hash তৈরি করে। `.env.local` ও `.security/` Git থেকে বাদ দেওয়া আছে। এগুলো কাউকে পাঠাবেন না বা public folder-এ রাখবেন না।

Local development server পুনরায় চালান: `npm run dev -- --host 0.0.0.0 --port 8080`। শুধু local পরিবর্তন দেখতে নতুন Apps Script deployment-ও প্রয়োজন।

### ওয়েবসাইট থেকে পাসওয়ার্ড বদলানো

এই সুবিধার জন্য বর্তমান GS কোড একবার deploy করুন: `node scripts/build-apps-script-paste-ready.mjs` চালিয়ে `.security/GoogleAppsScript_PasteReady.gs`-এর সম্পূর্ণ কোড বসান, তারপর **Manage deployments → Edit → New version → Deploy** করুন। Website-এর নতুন code-ও ব্যবহার করতে হবে। পুরোনো GS version-এ password-state action নেই, তাই নতুন website-এর login-ও কাজ করবে না; আগে GS update করুন।

লগইন করে হোমপেজের **পাসওয়ার্ড পরিবর্তন** চাপুন। বর্তমান পাসওয়ার্ড, কমপক্ষে ৬ অক্ষরের আলাদা নতুন পাসওয়ার্ড এবং নতুন পাসওয়ার্ডের confirmation দিন। সফল হলে সব ডিভাইসে নতুন করে login করতে হবে; server restart বা প্রতিবার GS deploy দরকার নেই।

নতুন পাসওয়ার্ডের salted scrypt hash শুধু trusted backend থেকে Apps Script-এর private Script Properties-এ যায়; browser-এ hash/secret বা Sheet-এ plaintext password রাখা হয় না। প্রতিটি authenticated request-এ সর্বশেষ hash দিয়ে session পরীক্ষা হয়। একই সময়ে দুজন বদলালে lock-এর মধ্যে expected hash মিলিয়ে একটি পরিবর্তনই গ্রহণ করা হয়। Store unavailable বা response invalid হলে পুরোনো environment password দিয়ে fallback login হয় না।

### Terminal থেকে পাসওয়ার্ড reset বা বদলানো

Repository-র terminal-এ চালান:

```sh
npm run security:password
```

কমপক্ষে ৬ অক্ষরের নতুন পাসওয়ার্ড দুবার দিন; টাইপ করার সময় দেখা যাবে না। এরপর চলমান local server `Ctrl+C` দিয়ে বন্ধ করে আবার `npm run dev -- --host 0.0.0.0 --port 8080` চালান এবং নতুন পাসওয়ার্ড দিয়ে লগইন করুন। এটি শুধু `.env.local`-এর `APP_PASSWORD_HASH` বদলায়; Google/API/session secrets ও তৈরি করা GS ফাইল একই থাকে। পুরোনো login session আর গ্রহণ করা হবে না। Apps Script আবার deploy করতে হবে না, Sheet-এর Settings tab-এ password বদলালেও login password বদলায় না।

Live hosting-এ ব্যবহার করলে নতুন `APP_PASSWORD_HASH` hosting-এর server environment-এ বসিয়ে website restart/deploy করতে হবে; স্থানীয় কমান্ড নিজে hosting পরিবর্তন করে না। শুধু পাসওয়ার্ডের জন্য `--rotate` ব্যবহার করবেন না; সেটি সব credentials বদলানোর জন্য।

`APP_PASSWORD_HASH` login-এর initial password ও offline recovery seed। Web পরিবর্তন একই seed-এর জন্য private Script Property-এ থাকে, তাই restart, অন্য device বা GS redeploy-এ হারায় না। CLI নতুন salted hash তৈরি করে recovery-এর জন্য নতুন scope বেছে নেয়। পুরোনো environment backup হুবহু ফিরিয়ে আনলে সেই scope-এর আগের web password আবার কার্যকর হতে পারে; reset-এর জন্য কমান্ড দিয়ে নতুন hash তৈরি করুন।

## ২. Apps Script-এ পুরোনো deployment বন্ধ করে নতুন কোড দিন

**শুধু paste করে deploy করার বিকল্প:** স্থানীয় credentials তৈরি হয়ে গেলে `node scripts/build-apps-script-paste-ready.mjs` চালান। তৈরি হওয়া `.security/GoogleAppsScript_PasteReady.gs`-এর সম্পূর্ণ code Apps Script-এ বসিয়ে **বর্তমান deployment → Edit → New version → Deploy** করুন। এতে প্রথম POST বা `testConnection`-এ Script Properties নিজে কনফিগার হবে; নিচের manual property entry লাগবে না। একই `/exec` URL রাখলে website configuration বদলাতে হবে না। এই private ফাইলে server secret থাকে—চ্যাট, public folder বা Git-এ শেয়ার করবেন না। স্থানীয় API secret বদলালে ফাইলটি নতুন করে তৈরি করে deploy করতে হবে।

নিচের ধাপগুলো সাধারণ, secret ছাড়া রাখা `GoogleAppsScript_Code.js` ব্যবহারের জন্য:

1. Apps Script editor-এ `GoogleAppsScript_Code.js`-এর সম্পূর্ণ কোড বসান।
2. বাম পাশের ⚙️ **Project Settings → Script properties → Add script property**-এ `.security/apps-script-properties.json` থেকে নিচের দুটি property আলাদা করে বসিয়ে **Save script properties** চাপুন। JSON-এর উদ্ধৃতি/কমা কপি করবেন না। স্থানীয় JSON ফাইল তৈরি হওয়া মানেই Google-এর Script properties তৈরি হওয়া নয়।

   | Property         | স্থানীয় ফাইল থেকে যে Value নেবেন      |
   | ---------------- | ------------------------------------- |
   | `APP_SECRET`     | `APP_SECRET`-এর সম্পূর্ণ মান          |
   | `SPREADSHEET_ID` | `SPREADSHEET_ID`-এর মান; Sheet URL নয় |

3. Editor-এর function dropdown থেকে **testConnection → Run** দিন। Google authorization চাইলে নিজের account দিয়ে অনুমতি সম্পন্ন করুন। **Execution log**-এ `CONNECTION_OK` হলে configuration ও Sheet access ঠিক আছে। Error হলে সেই code/message অনুসরণ করুন। এই পরীক্ষা Sheet-এ কিছু লেখে না।
4. **Deploy → Manage deployments → Edit (পেন্সিল) → Version: New version → Deploy** করুন। Web app-এর **Execute as: Me**, **Who has access: Anyone** হতে হবে, যাতে website backend অনুরোধ করতে পারে; API নিজে secret যাচাই করে। Domain policy-তে এই option না থাকলে administrator-এর অনুমতি প্রয়োজন। Deployment URL-এর শেষে `/exec` ব্যবহার করুন; `/dev` নয়। URL বদলালে `.env.local`-এর `GOOGLE_SCRIPT_URL` হালনাগাদ করে local server restart করুন। **পুরোনো secret/GET handler চলমান থাকে এমন আগের Web App deployment archive করুন।**
5. Sheet-এর Settings tab থেকে plaintext password ও fallback password cells সরান। Sheet-এর sharing **Restricted** করুন এবং আগের Publish to web প্রকাশ বন্ধ করুন। নতুন backend Apps Script owner-এর অনুমতিতে Sheet পড়ে; public CSV আর প্রয়োজন নেই।

`/exec` browser-এ সরাসরি খুললে `GET reads are disabled` আসা স্বাভাবিক। Editor থেকে `doPost` Run করলে event থাকে না, তাই `Invalid request` আসে। সংযোগ পরীক্ষার জন্য `testConnection` এবং website-এর refresh ব্যবহার করুন। Google-এর [Script properties](https://developers.google.com/apps-script/guides/properties) ও [Web app deployment](https://developers.google.com/apps-script/guides/web) নির্দেশনাও দেখুন।

## ৩. Website hosting-এ runtime secrets বসিয়ে deploy

Hosting-এর server/Worker environment-এ `.env.local` থেকে এগুলো দিন:

- `APP_PASSWORD_HASH`
- `APP_SESSION_SECRET`
- `GOOGLE_APPS_SCRIPT_SECRET` — Apps Script `APP_SECRET`-এর সঙ্গে এক হবে
- `GOOGLE_SHEET_ID` — Apps Script `SPREADSHEET_ID`-এর সঙ্গে এক হবে
- `GOOGLE_SCRIPT_URL`

এসবের নামের আগে `VITE_` দেবেন না। `VITE_APP_SECRET` hosting/build environment থেকেও মুছে দিন। পুরোনো প্রকাশিত secret ও password পুনরায় ব্যবহার করবেন না। Production-এ HTTPS দরকার; session cookie HttpOnly, SameSite=Lax এবং Secure হয়। Cookie-এর মেয়াদ ৮ ঘণ্টা। Password hash বা session secret বদলালে আগের session আর গ্রহণ করা হয় না।

Website-র নতুন build deploy করুন; পুরোনো static bundle/cache প্রতিস্থাপন করুন। Cloudflare runtime compatibility date 2026-08-04 বা পরের হলে Node crypto compatibility স্বয়ংক্রিয়; পুরোনো runtime-এ `nodejs_compat` চালু করতে হবে। scrypt login-এর CPU/memory budget hosting-এ মাপুন। Login-এর process-local throttle আছে; একাধিক worker-এ একই সীমা কার্যকর করতে hosting-এর distributed login rate limit ব্যবহার করুন।

## ৪. যাচাই

```sh
node --test tests/*.test.mjs
node scripts/test-security-runtime.mjs
npx tsc --noEmit
npm run build
```

Runtime smoke test আলাদা local port 8091-এ সাময়িক server/credentials দিয়ে login, encrypted cookie, unauthorized read/save/delete, CSRF এবং logout পরীক্ষা করে; Google Sheet-এ কোনো request পাঠায় না।

লগআউট অবস্থায় save/delete/read প্রত্যাখ্যাত হবে। Browser-এ `sessionStorage.isLoggedIn=true` বসালেও private API খুলবে না। অজানা/আংশিক ID, সার্ভার error বা local draft কখনো যাচাইকৃত badge দেবে না।

ডিলিটের পরে নতুন করে যাচাই খুললে রেকর্ড পাওয়া যাবে না; আগে খোলা verification পেজ refresh করে সার্ভারে আবার যাচাই করুন। আয় ১০০, ব্যয় ১৫০ হলে সম্মানী ০, আসল ব্যয় ১৫০ থাকবে।

Server-only session/data-boundary patterns: [TanStack server functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions), [Nitro Cloudflare runtime environment](https://nitro.build/deploy/providers/cloudflare), [Cloudflare Node crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/).
