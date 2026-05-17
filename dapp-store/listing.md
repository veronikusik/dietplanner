# DietPlanner

DietPlanner is an Android-first nutrition planning app built for Solana Mobile users. It combines local, privacy-preserving meal planning with wallet-connected SKR premium feature unlocks.

## Highlights

- Personalized daily meal planning based on goal, height, weight, age, and activity level.
- Food discovery using bundled nutrition references from public-source datasets.
- Educational nutrition explanations with clear health and safety disclaimers.
- Solana Mobile Wallet Adapter integration.
- SKR token payments for premium features such as AI Chef Pro, Deep Food Intel, and Micro-Coach.
- Local-first privacy model: profile and preferences stay on device; no analytics or advertising SDKs.

## Blockchain features

DietPlanner uses Solana Mobile Wallet Adapter for wallet authorization and SPL token payment signing. The app does not custody funds, private keys, recovery phrases, or wallet credentials. Every purchase is preceded by an in-app confirmation modal that itemises the exact SKR amount, the publisher treasury wallet, and the irreversibility of the transfer; the wallet popup only appears after the user explicitly consents.

## In-app purchases (paid in SKR on Solana)

| Feature | Price | Access | What it unlocks |
| --- | --- | --- | --- |
| AI Chef Pro | 100 SKR | 30 days | AI-assisted 30-day rotating meal calendar, adaptive grocery lists, meal-prep schedule, saved favorite plans |
| Deep Food Intel | 50 SKR | One-time | Goal-fit analysis, vitamin and mineral notes, dietary cautions, suggested substitutions |
| Micro-Coach | 10 SKR | 24 hours | On-chain daily check-in, streak badge, wallet-linked progress |

All SKR amounts plus Solana network fees are paid from the user's connected wallet directly to the publisher treasury on signing confirmation. Blockchain transactions are public and irreversible.

## AI-generated content disclosure

AI Chef Pro uses algorithmic and AI-assisted generation. Generated meal plans, grocery lists, and nutrition explanations may be inaccurate or incomplete. Users must verify ingredient suitability, allergens, and macros before acting on app output.

## Health disclaimer

DietPlanner provides educational nutrition information only. It is not a medical device, does not provide medical advice, and does not diagnose, treat, cure, or prevent disease. Users should consult a qualified healthcare professional before making diet changes — especially in cases of diabetes, kidney disease, eating disorders, food allergies, pregnancy, lactation, or interaction with medication.

## Privacy summary

Profile data (age, sex, height, weight, activity level, goals, interests) is stored only on the device using Expo SecureStore. The app does not operate an account server, does not upload profile data to a DietPlanner server, does not sell personal information, and ships without analytics SDKs, tracking pixels, or advertising identifiers. Public wallet addresses and transaction data are sent only to Solana RPC providers as required to complete user-initiated transactions.

## Eligibility

Users must be 18 or older and legally able to use a Solana wallet in their jurisdiction. The app is not intended for jurisdictions where nutrition apps, Solana wallets, SKR tokens, or blockchain transactions are unlawful.

## Developer

Developer: DietPlanner
Email: contact@dietplanner.fit
GitHub: https://github.com/veronikusik
Website: https://dietplanner.fit/
