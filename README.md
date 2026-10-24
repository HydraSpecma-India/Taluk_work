# Tamil Nilam — Land Records & Statutory Citizen Services Suite

A dedicated statutory services application for Tamil Nilam land records administration.

## Scope of Features
1. **📜 Chitta Extract (Tahsildar Login)**:
   - Search by Patta Number or Survey/Subdivision Number across all 38 districts of Tamil Nadu.
   - Live Chitta 10(1) extract with instant PDF preview and download.
2. **🌐 e-Services (No OTP)**:
   - 14 statutory citizen services (0101-0114 Rural, N101-N110 Natham).
   - Live application query, certificate download, order copy extract, and status verification.
3. **📑 A-Register Extract (PDF)**:
   - Tahsildar Master A-Register PDF generator with high-resolution inline preview and auto-download.
4. **📝 A-Register Unified Approval Suite**:
   - Live pending application fetching for 0109, 0108, 0111, 0112, N108, N109.
   - Application registration, live survey & Chitta validation, one-click Tahsildar approval, and bulk approval.
5. **✏️ Patta Name & Size Correction**:
   - Dual search (by Patta No or Survey/Subdiv No) with live owner name & extent extraction.
   - Statutory A-Register correction workflow submission and Tahsildar approval.
6. **🔑 Tamil Nilam Credentials**:
   - Secure management and testing of Tahsildar credentials per taluk.
7. **🗄️ Database Info & Query Console**:
   - Live Supabase schema directory, query console, CSV export, and administration tools.
8. **👥 Authorized Users & Roles**:
   - Shared Supabase authentication and RBAC user permissions.

## Shared Database with Reports App
- Both this app and the **Reports & Reject Reason Analysis Dashboard** share the identical Supabase database (`ollhtyeflpggdazrsqsq.supabase.co`).
- Any user account created in either app can log into both apps seamlessly.
- Permissions configured in either app apply consistently.

## Deployment on Vercel
1. Import repository `https://github.com/HydraSpecma-India/Taluk_work.git` in Vercel.
2. Framework Preset: **Other** / Static Site.
3. Root Directory: `./`
4. Deploy!
