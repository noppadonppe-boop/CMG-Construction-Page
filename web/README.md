# CMG Project Hub

ระบบบริหารโครงการก่อสร้าง: ภาพรวมโครงการ, S-Curve ความคืบหน้า, รายงานประจำวัน (Site Diary), ปัญหา/ความปลอดภัย/RFI, เอกสาร/แบบ และรายงาน — พร้อมระบบผู้ใช้ สิทธิ์ตาม Role และข้อมูลแบบ Realtime

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Firebase (Authentication + Firestore + Storage)

## เริ่มใช้งาน

```bash
npm install
npm run dev
```

เปิด http://localhost:3000 — ต้องมีไฟล์ `.env` (ค่า Firebase Web config, ดูรูปแบบที่ `.env.example` — ไฟล์นี้ไม่ถูก commit)

## ตั้งค่า Firebase (โปรเจกต์ `cmg-construction-page`)

ใน [Firebase Console](https://console.firebase.google.com/project/cmg-construction-page)
1. **Authentication → Sign-in method** เปิด **Google** และ **Email/Password**
2. **Authentication → Settings → Authorized domains** เพิ่มโดเมนที่ deploy จริง (`localhost` มีให้แล้ว)
3. **Firestore Database** และ **Storage** ต้องสร้างไว้แล้ว และ Rules ต้องอนุญาตให้อ่าน/เขียนที่ `Cmg-Cons-Page-Claude/root/**`

> Firestore Rules ที่ใช้กับแอปนี้อยู่ใน `firebase/firestore.rules` — ผู้ใช้ที่ล็อกอินอ่าน/เขียนได้ทุกคอลเลกชัน ยกเว้น `menus` (เมนูเพิ่มเติม) และ `formStandards` (มาตรฐานแบบฟอร์ม) ที่เขียนได้เฉพาะ MasterAdmin/Admin ที่อนุมัติแล้ว · deploy ด้วย `firebase deploy --only firestore:rules`
>
> Storage Rules อยู่ใน `firebase/storage.rules` — ผู้ใช้ที่ล็อกอินอ่าน/เขียนไฟล์ใต้ `Cmg-Cons-Page-Claude/root/**` ได้ ยกเว้นไอคอนเมนู (`menus/icons`) ที่อัปโหลดได้เฉพาะ MasterAdmin/Admin · deploy ด้วย `firebase deploy --only storage` · ถ้าสร้างฐานข้อมูลแบบ **test mode** Rules จะหมดอายุใน 30 วัน

## Deploy (web.app)

แอปจริงอยู่ที่ https://cmg-construction-page.web.app — build เป็นไฟล์ static แล้วอัปโหลดขึ้น Firebase Hosting (ในโฟลเดอร์ `web`):

```bash
npm run build:static
firebase deploy --only hosting
```

- `build:static` ตั้ง `STATIC_EXPORT=1` → `next build` ส่งออกไฟล์ไปที่ `out/` (ปิด cacheComponents เฉพาะตอนนี้ เพราะ static export ใช้ไม่ได้)
- หน้าที่มี id ใน URL (`/projects/{id}`, `/m/{id}`, ...) build ไว้หน้าเดียวที่ id `_` แล้ว `firebase.json` rewrite ทุก id มาที่หน้านั้น — หน้าอ่าน id จริงด้วย `useRouteParams` / `useActualPathname` (`src/lib/static-export.ts`)
- ถ้าเพิ่มหน้าที่มี id ใหม่: ใส่ `generateStaticParams` ที่ layout ของ segment นั้น, ใช้ `useRouteParams` แทน `useParams` และเพิ่ม rewrite ใน `firebase.json`
- ทดสอบก่อนขึ้นจริงได้ด้วย `firebase hosting:channel:deploy <ชื่อ>` (ได้ลิงก์ทดสอบชั่วคราว)

## ระบบผู้ใช้

| หัวข้อ | การทำงาน |
|---|---|
| เข้าสู่ระบบ | Google (popup) หรือ Email/Password · จำการล็อกอินถาวร (`browserLocalPersistence`) อายุสูงสุด 30 วัน |
| สมัคร | Email/Password ที่ `/register` หรือเข้าด้วย Google ครั้งแรก |
| ผู้ใช้คนแรกของระบบ | ได้ **MasterAdmin** + อนุมัติทันที (ตรวจใน Firestore transaction จาก `appMeta/config`) |
| ผู้ใช้คนถัดไป | ได้ **Staff** + สถานะ **รออนุมัติ** → อยู่หน้า `/pending` จนกว่า MasterAdmin อนุมัติ (พาเข้าแอปอัตโนมัติ) |
| จัดการผู้ใช้ | เมนู "จัดการผู้ใช้งาน" มุมซ้ายล่างของ Sidebar (เฉพาะ MasterAdmin มีตัวเลขแจ้งคนรออนุมัติ) — อนุมัติ/ระงับ, กำหนดได้หลาย Role, assign โครงการ, แก้ข้อมูลผู้ใช้ |
| โปรไฟล์ตัวเอง | กดรูปโปรไฟล์มุมขวาบน → แก้ไขโปรไฟล์ / ออกจากระบบ (แก้ Role และโครงการเองไม่ได้) |
| ประวัติ | `REGISTER` / `LOGIN` / `LOGOUT` บันทึกที่ `activityLogs` (ไม่รอผล ไม่กระทบการล็อกอิน) |

**ไม่มีหน้า Login กระพริบ:** ระหว่างตรวจ token แสดง spinner เท่านั้น (HTML แรกจาก server ก็เป็น spinner) เมื่อรู้ผลแล้วจึง redirect หรือแสดงฟอร์ม

### Role และสิทธิ์ (มีหลาย Role ได้ = ได้สิทธิ์รวมทุก Role)

| Role | เห็นโครงการ | สิทธิ์หลัก |
|---|---|---|
| MasterAdmin | ทั้งหมด | ทุกอย่าง + จัดการผู้ใช้ |
| Admin | ทั้งหมด | สร้าง/แก้/ลบโครงการ, ทุกเมนู, อนุมัติ/ลบเอกสาร, ส่งออก |
| Executive | ที่ assign | ดูทุกเมนู, รายงาน + ส่งออก |
| ProjectManager | ที่ assign | แก้ข้อมูล/ความคืบหน้าโครงการ, รายงานประจำวัน, ปัญหา, อัปโหลด/อนุมัติเอกสาร, รายงาน |
| Engineer | ที่ assign | รายงานประจำวัน, แจ้ง/อัปเดตปัญหา, อัปโหลดเอกสาร, ดูรายงาน |
| QS | ที่ assign | ดูทุกเมนู, อัปโหลดเอกสาร, รายงาน + ส่งออก |
| Staff | ที่ assign | ดูอย่างเดียว |

กำหนดไว้ที่ `src/lib/auth/roles.ts` — เมนูใน Sidebar และปุ่มต่าง ๆ แสดงตามสิทธิ์

## Realtime และการกันบันทึกชนกัน

- ทุกหน้าฟังข้อมูลด้วย `onSnapshot` — คนอื่นบันทึกแล้วหน้าจอเปลี่ยนเองโดยไม่ต้องรีเฟรช (รวมถึงการอนุมัติ/เปลี่ยน Role/assign โครงการ)
- **ข้อความที่กำลังพิมพ์ไม่หาย** เมื่อคนอื่นบันทึก: ฟอร์มเก็บค่าของตัวเอง ไม่ถูกเขียนทับจากข้อมูล realtime
- **แก้ข้อมูลโครงการ/ความคืบหน้า:** ตรวจ `version` ใน transaction — ถ้ามีคนบันทึกหลังเราเปิดฟอร์ม จะแจ้งเตือนและให้เลือก "ใช้ข้อมูลล่าสุด" หรือ "บันทึกทับ" เอง
- **กันบันทึกซ้ำ:** ปุ่มปิดระหว่างบันทึก + รหัสโครงการจองใน `projectCodes`, รายงาน 1 ฉบับ/วัน (id = วันที่), เลขรันของเรื่อง และ Rev. เอกสาร ตรวจใน transaction

## โครงสร้างข้อมูล

```
Cmg-Cons-Page-Claude / root
├─ appMeta / config            firstUserRegistered, totalUsers, createdAt
├─ users / {email}             uid, email, firstName, lastName, position, department,
│                              role[], status (pending|approved|rejected), assignedProjects[],
│                              createdAt, photoURL, isFirstUser
├─ activityLogs / {auto}       action, email, at, method
├─ projectCodes / {CODE}       project_id  (จองรหัสโครงการไม่ให้ซ้ำ)
└─ projects / {projectId}      code, name, client, location, contract_value, start_date, end_date,
   │                           status, manager_name, progress[], issue_counters{}, version,
   │                           created_by, updated_by, created_at, updated_at
   ├─ settings / dcr                 ตั้งค่ารายงานประจำวัน: client, contractor, consultants[], subcontractors[]
   │                                 (ชื่อ + logo{path,url}), indirect_roles[], trades[], equipment[],
   │                                 working_hours, report_counter (เลขรันรายงาน)
   ├─ daily_reports / {YYYY-MM-DD}   Daily construction report (schema 2): report_no, status, working_hours,
   │                                 weather{am,pm,rain_mm,lost_hours,...}, manpower{indirect[],direct[]},
   │                                 equipment[], materials[], progress[{zone,category,description,photos[]}],
   │                                 safety, quality, issues[], tomorrow[], signatures{prepared,reviewed,acknowledged}
   ├─ issues / {auto}                code, category, title, description, priority, status,
   │                                 assignee, due_date, photos[], created_at, closed_at
   └─ documents / {auto}             category, doc_no, title, status, revisions[{rev, file_name, path, url, ...}]

Storage: Cmg-Cons-Page-Claude/root/projects/{projectId}/{daily_reports|issues|documents}/{docId}/{ไฟล์}
```

`users` และ `projects` อยู่ชั้นเดียวกัน — ผู้ใช้เห็นเฉพาะโครงการใน `assignedProjects` (ยกเว้น MasterAdmin/Admin) และข้อมูลทุกเมนูเก็บอยู่ในโครงการของตัวเอง

## สคริปต์

```bash
npm run seed                          # ใส่ข้อมูลตัวอย่าง (5 โครงการ + รายงาน + เรื่อง)
npm run seed -- --only issues         # เฉพาะบางหมวด
npm run migrate                       # ดูว่าข้อมูลโครงสร้างเดิมจะถูกย้ายอย่างไร
npm run migrate -- --apply            # ย้ายข้อมูลโครงสร้างเดิมเข้าใต้โครงการ (รันซ้ำได้)
npm run migrate:dcr -- --apply        # แปลงรายงานประจำวันรูปแบบเดิมเป็น Daily construction report (รันซ้ำได้)
```

## รายงานประจำวัน (Daily construction report)

- **ตั้งค่าต่อโครงการ** (`/projects/{id}/report-settings`, สิทธิ์แก้โครงการ): ชื่อและโลโก้ของ Client, Main contractor,
  Consultant (หลายราย) และ Subcontractor (หลายราย), เวลาทำงาน, รายการตำแหน่ง/ประเภทช่าง/เครื่องจักรตั้งต้น
- **ฟอร์มกรอก** (`/daily-reports/{projectId}/{date}/edit`): 9 ส่วน — ข้อมูลโครงการ, สภาพอากาศเช้า/บ่าย + ชั่วโมงสูญเสีย,
  กำลังคน Indirect/Direct (Main/Sub), เครื่องจักร/วัสดุ, ความคืบหน้า + รูปพร้อมคำบรรยาย, ความปลอดภัย/QC, ปัญหา, แผนพรุ่งนี้, ลงนาม
  - "คัดลอกจากเมื่อวาน" ยกกำลังคน เครื่องจักร และแผนพรุ่งนี้ของฉบับก่อนมาเป็นงานวันนี้
  - สำรองร่างในเครื่องอัตโนมัติ, ตรวจ version กันบันทึกทับ, เลขที่รายงาน `DCR-{โครงการ}-{ลำดับ}` ออกใน transaction
- **รายงาน A4** (`/daily-reports/{projectId}/{date}`): แถบโลโก้ 4 กลุ่ม, ตารางตามมาตรฐาน, ช่องลงนาม 3 ช่อง, ภาคผนวกรูปถ่าย, พิมพ์/บันทึก PDF
- **สถานะ:** ร่าง → ส่งตรวจ (ผู้จัดทำ) → ตรวจแล้ว → รับทราบ (ผู้มีสิทธิ์แก้โครงการ) · ตีกลับแก้ไขได้ (ล้างลายเซ็นตรวจ/รับทราบ)

## โครงสร้างโค้ด

```
src/
  app/login, register, pending   หน้าเข้าสู่ระบบ / สมัคร / รออนุมัติ
  app/(app)/                     หน้าที่ต้องล็อกอิน (ProtectedRoute + Sidebar)
    admin/                       จัดการผู้ใช้ (MasterAdmin)
    projects/ daily-reports/ issues/ documents/ reports/
  lib/auth/                      roles.ts, service.ts (login/register/logout), context.tsx (AuthContext)
  lib/db/                        ข้อมูล realtime + บันทึกของแต่ละเมนู, paths.ts = path ทั้งหมด
  lib/firebase/                  config + client (Auth/Firestore/Storage)
  components/                    protected-route, sidebar, profile-menu, multi-select, ...
scripts/                         seed.mjs, migrate-to-projects.mjs
```

## Roadmap

- ✅ Phase 1: โครงการ, S-Curve, รายงานประจำวันพร้อมรูป, ปัญหา/ความปลอดภัย/RFI
- ✅ Phase 2: เอกสาร/แบบ (revision), รายงานสัปดาห์/ผู้บริหาร (พิมพ์ PDF), ส่งออก Excel
- ✅ ระบบผู้ใช้: Google/Email login, MasterAdmin คนแรก, อนุมัติผู้ใช้, หลาย Role, assign โครงการ, Realtime
- **Phase 3:** BOQ/ต้นทุน/งวดงาน, Gantt, แจ้งเตือน LINE
