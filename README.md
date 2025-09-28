
# Annakut Vaangi Seva (Firebase + React + EmailJS)

Single-page app with:
- **Home**: welcome + form (name/email/phone) + expandable categories with items (checkboxes). Items already taken show red, available green. Submitting reserves items and sends an EmailJS email.
- **/admin** (admin only): add a category and comma-separated items.
- **/dashboard** (admin only): table of all pledges.

## 1) Firebase Setup
1. Create a Firebase project and enable **Authentication (Email/Password)** and **Firestore**.
2. In Firestore, **no data required** initially — use the Admin page to add categories/items.
3. In Authentication, create an admin user (email/password).
4. Create a document `roles/{uid}` with `{ "role": "admin" }` for that user's UID.
5. Publish **security rules** from `firestore.rules`.

## 2) Local Run
```bash
npm i
cp .env.example .env
# Fill your Firebase config and EmailJS keys in .env
npm run dev
```

## 3) Build & Deploy
```bash
npm run build
# Then deploy to Firebase Hosting
firebase init hosting  # choose 'dist' as public
firebase deploy
```

## 4) EmailJS
Create a service, a template, and use your **Public Key**.
Set in `.env`:
```
VITE_EMAILJS_SERVICE=your_service_id
VITE_EMAILJS_TEMPLATE=your_template_id
VITE_EMAILJS_PUBLIC=your_public_key
```
Template vars used:
- `to_name`, `from_name`, `user_name`, `user_email`, `user_phone`, `items`

## Notes
- Admin and Dashboard are **protected**. Only signed-in users with role `admin` (via `roles/{uid}`) can access.
- Item reservation uses a Firestore transaction and a `taken/{itemId}` doc to lock each item.
- To free an item, delete the corresponding `taken` doc manually in the console (or build an admin UI).
