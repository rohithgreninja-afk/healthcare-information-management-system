import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
function readEnv() {
  try { for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  } } catch { /* .env is optional */ }
}
readEnv();
const port = Number(process.env.PORT || 3000);
const dbPath = path.resolve(ROOT, process.env.DB_FILE || './data/hims.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
db.exec('PRAGMA foreign_keys = ON');
function ensureColumn(table, column, definition) {
  const columns=db.prepare(`PRAGMA table_info(${table})`).all();
  if(!columns.some(item=>item.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn('doctors','whatsapp_opt_in','INTEGER NOT NULL DEFAULT 0');
ensureColumn('patients','whatsapp_opt_in','INTEGER NOT NULL DEFAULT 0');
ensureColumn('doctors','email','TEXT');
ensureColumn('users','email','TEXT');
ensureColumn('users','email_opt_in','INTEGER NOT NULL DEFAULT 0');
const phoneColumn=db.prepare('PRAGMA table_info(users)').all().find(column=>column.name==='phone');
if(phoneColumn?.notnull){
  db.exec('PRAGMA foreign_keys = OFF');db.exec('BEGIN IMMEDIATE');
  try{
    db.exec(`CREATE TABLE users_email_migration (
      id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT UNIQUE, email TEXT,
      email_opt_in INTEGER NOT NULL DEFAULT 0, password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','doctor','patient')),
      patient_id TEXT UNIQUE REFERENCES patients(id) ON DELETE CASCADE,
      doctor_id TEXT UNIQUE REFERENCES doctors(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec('INSERT INTO users_email_migration(id,phone,email,email_opt_in,password_hash,role,patient_id,doctor_id,created_at) SELECT id,phone,email,email_opt_in,password_hash,role,patient_id,doctor_id,created_at FROM users');
    db.exec('DROP TABLE users');db.exec('ALTER TABLE users_email_migration RENAME TO users');db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  db.exec('PRAGMA foreign_keys = ON');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE email IS NOT NULL');

const seed = db.prepare('SELECT COUNT(*) AS n FROM patients').get().n === 0;
if (seed) {
  const addDoctor = db.prepare('INSERT INTO doctors(id,name,specialty,department,phone) VALUES (?,?,?,?,?)');
  addDoctor.run('D001','Dr. Sarah Lee','General Physician','Internal Medicine','+1 800 555 0401');
  addDoctor.run('D002','Dr. Raj Patel','Cardiologist','Cardiology','+1 800 555 0402');
  addDoctor.run('D003','Dr. Amir Khan','Orthopaedist','Orthopaedics','+1 800 555 0403');
  const addPatient = db.prepare('INSERT INTO patients(id,name,age,gender,blood,phone,doctor_id,dob,email,address,emergency_contact) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  addPatient.run('P001','John Smith',45,'Male','O+','+1 800 555 0101','D001','1980-03-12','john.smith@email.com','12 Elm Street, San Francisco, CA','Jane Smith +1 800 555 0202');
  addPatient.run('P002','Mary Johnson',32,'Female','A+','+1 800 555 0202','D001','1993-07-05','mary.j@email.com','45 Oak Avenue, Los Angeles, CA','');
  addPatient.run('P003','Alan Brown',60,'Male','B-','+1 800 555 0303','D002','1965-11-18','alan.b@email.com','78 Pine Road, San Diego, CA','');
  const invoice = db.prepare('INSERT INTO invoices VALUES (?,?,?,?,?,?)');
  invoice.run('INV-101','P001','2026-02-20','Consultation',80,'Paid');
  invoice.run('INV-102','P001','2026-02-18','Lab Tests',150,'Unpaid');
  invoice.run('INV-103','P001','2026-01-10','Routine Check-up',60,'Paid');
  db.prepare('INSERT INTO appointments(patient_id,doctor_id,date,time,reason,symptoms,status) VALUES (?,?,?,?,?,?,?)').run('P001','D001','2026-03-05','09:00','Follow-up','Mild chest discomfort','Pending');
  db.prepare('INSERT INTO appointments(patient_id,doctor_id,date,time,reason,symptoms,status) VALUES (?,?,?,?,?,?,?)').run('P002','D001','2026-03-05','11:00','Consultation','Fatigue','Pending');
  db.prepare('INSERT INTO appointments(patient_id,doctor_id,date,time,reason,symptoms,status) VALUES (?,?,?,?,?,?,?)').run('P003','D001','2026-03-18','14:00','Lab Review','Joint pain','Pending');
  db.prepare('INSERT INTO diagnoses(patient_id,doctor_id,date,diagnosis,notes) VALUES (?,?,?,?,?)').run('P001','D001','2026-02-20','Hypertension','Blood pressure elevated. Monitor weekly.');
  db.prepare('INSERT INTO diagnoses(patient_id,doctor_id,date,diagnosis,notes) VALUES (?,?,?,?,?)').run('P001','D002','2026-01-10','Routine Check','All vitals normal.');
  db.prepare('INSERT INTO prescriptions(patient_id,doctor_id,date,medicine,dosage,duration) VALUES (?,?,?,?,?,?)').run('P001','D001','2026-02-20','Amlodipine','5mg once daily','30 days');
  const lab=db.prepare('INSERT INTO lab_results(patient_id,date,test,result,normal_range,status) VALUES (?,?,?,?,?,?)');
  lab.run('P001','2026-02-18','Blood Pressure','145/95 mmHg','120/80 mmHg','High');
  lab.run('P001','2026-02-18','Blood Sugar (Fasting)','98 mg/dL','70-100 mg/dL','Normal');
  db.prepare('INSERT INTO appointments(patient_id,doctor_id,date,time,reason,symptoms,status) VALUES (?,?,?,?,?,?,?)').run('P001','D002','2026-02-20','10:00','Consultation','Headache, high BP','Completed');
  db.prepare('INSERT INTO appointments(patient_id,doctor_id,date,time,reason,symptoms,status) VALUES (?,?,?,?,?,?,?)').run('P001','D003','2026-01-10','14:00','Check-up','Routine check','Completed');
}
if (db.prepare('SELECT COUNT(*) AS n FROM lab_results').get().n === 0 && db.prepare('SELECT id FROM patients WHERE id=?').get('P001')) {
  const lab=db.prepare('INSERT INTO lab_results(patient_id,date,test,result,normal_range,status) VALUES (?,?,?,?,?,?)');
  lab.run('P001','2026-02-18','Blood Pressure','145/95 mmHg','120/80 mmHg','High');
  lab.run('P001','2026-02-18','Blood Sugar (Fasting)','98 mg/dL','70-100 mg/dL','Normal');
}
db.exec("UPDATE users SET email=(SELECT email FROM patients WHERE patients.id=users.patient_id) WHERE email IS NULL AND patient_id IS NOT NULL AND EXISTS (SELECT 1 FROM patients WHERE patients.id=users.patient_id AND patients.email IS NOT NULL AND patients.email<>'')");

const json = (res, status, data) => { res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }); res.end(JSON.stringify(data)); };
const bad = (message, status=400) => Object.assign(new Error(message), { status });
async function body(req) {
  let raw=''; for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw bad('Request body too large.',413); }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw bad('Request body must be valid JSON.'); }
}
function required(data, fields) { for (const f of fields) if (typeof data[f] !== 'string' || !data[f].trim()) throw bad(`${f} is required.`); }
function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [year, month, day] = s.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day;
}
function patientRow(row) { return row && ({...row, doctor:row.doctor_name || '', dob:row.dob || '', email:row.email || '', address:row.address || '', emergency_contact:row.emergency_contact || ''}); }
const patientSelect = `SELECT p.*, d.name AS doctor_name FROM patients p LEFT JOIN doctors d ON d.id=p.doctor_id`;
const doctorSelect = `SELECT d.*, (SELECT COUNT(*) FROM patients p WHERE p.doctor_id=d.id) AS patient_count FROM doctors d`;
const invoiceSelect = `SELECT i.*, p.name AS patient FROM invoices i JOIN patients p ON p.id=i.patient_id`;
const appointmentSelect = `SELECT a.*, p.name AS patient, p.id AS patient_code, d.name AS doctor FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id`;

function normalizePhone(value) {
  if(typeof value!=='string')throw bad('Enter a phone number with country code, such as +14155550123.');
  const phone=value.replace(/[\s().-]/g,'');
  if(!/^\+[1-9]\d{7,14}$/.test(phone))throw bad('Enter a valid phone number with country code, such as +14155550123.');
  return phone;
}
function normalizeEmail(value) {
  if(typeof value!=='string')throw bad('Enter a valid email address.');
  const email=value.trim().toLowerCase();
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw bad('Enter a valid email address.');
  return email;
}
function sessionUser(req) {
  const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),decodeURIComponent(x.slice(i+1))];}));
  const token=cookies.hims_session;if(!token)return null;
  const tokenHash=createHash('sha256').update(token).digest('hex');
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  const row=db.prepare(`SELECT u.id,u.phone,u.email,u.role,u.patient_id,u.doctor_id,p.name patient_name,d.name doctor_name
    FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN patients p ON p.id=u.patient_id LEFT JOIN doctors d ON d.id=u.doctor_id
    WHERE s.token_hash=? AND s.expires_at>?`).get(tokenHash,Date.now());
  return row?{...row,tokenHash}:null;
}
function setSession(res,userId) {
  const token=randomBytes(32).toString('hex'),tokenHash=createHash('sha256').update(token).digest('hex'),expires=Date.now()+7*24*60*60*1000;
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(tokenHash,userId,expires);
  const secure=process.env.NODE_ENV==='production'?'; Secure':'';
  res.setHeader('Set-Cookie',`hims_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure}`);
}
function publicUser(user) { return {id:user.id,email:user.email||'',role:user.role,patientId:user.patient_id,doctorId:user.doctor_id,name:user.patient_name||user.doctor_name||'Administrator'}; }
function requireRole(user,roles) { if(!roles.includes(user.role))throw bad('You do not have permission to perform this action.',403); }
function requirePatientAccess(user,patientId) {
  if(user.role==='admin')return;
  if(user.role==='patient'&&user.patient_id===patientId)return;
  if(user.role==='doctor'&&db.prepare('SELECT id FROM patients WHERE id=? AND doctor_id=?').get(patientId,user.doctor_id))return;
  throw bad('You do not have permission to access this patient record.',403);
}
function passwordHash(password,salt=randomBytes(16).toString('hex')) { return `${salt}:${scryptSync(password,salt,64).toString('hex')}`; }
function passwordMatches(password,encoded) { const [salt,hash]=encoded.split(':');const actual=scryptSync(password,salt,64),expected=Buffer.from(hash,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected); }
function logNotification(appointmentId,role,type,status,messageId=null) {
  db.prepare('INSERT INTO notification_log(appointment_id,recipient_role,notification_type,status,provider_message_id) VALUES(?,?,?,?,?)').run(appointmentId,role,type,status,messageId);
}
async function sendEmail(to,subject,text,appointmentId,role,type) {
  const {SMTP_HOST:host,SMTP_USER:user,SMTP_PASS:pass,MAIL_FROM:from}=process.env;
  if(!host||!user||!pass||!from){logNotification(appointmentId,role,type,'not_configured');return;}
  try {
    const transporter=nodemailer.createTransport({host,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:{user,pass}});
    const result=await transporter.sendMail({from,to,subject,text});
    logNotification(appointmentId,role,type,'accepted',result.messageId||null);
  } catch(error) { console.error('Email notification failed:',error.message);logNotification(appointmentId,role,type,'failed'); }
}
async function notifyAppointment(id,event) {
  const appt=db.prepare(`${appointmentSelect} WHERE a.id=?`).get(id);if(!appt)return;
  const recipients=[
    {role:'patient',label:appt.patient,email:db.prepare('SELECT email,email_opt_in FROM users WHERE patient_id=?').get(appt.patient_code)},
    {role:'doctor',label:appt.doctor,email:db.prepare('SELECT email,email_opt_in FROM users WHERE doctor_id=?').get(appt.doctor_id)}
  ];
  const verb=event==='booked'?'has been booked':event==='completed'?'has been marked complete':'has been cancelled';
  for(const recipient of recipients){
    if(!recipient.email?.email_opt_in||!recipient.email.email){logNotification(id,recipient.role,event,'skipped_no_consent');continue;}
    const subject=event==='booked'?'HIMS appointment booked':`HIMS appointment ${event}`;
    const text=`Hello ${recipient.label},\n\nAn appointment ${verb}.\nPatient: ${appt.patient}\nDoctor: ${appt.doctor}\nDate: ${appt.date}\nTime: ${appt.time}\n\nPlease sign in to HIMS for details.`;
    void sendEmail(recipient.email.email,subject,text,id,recipient.role,event);
  }
}

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost'); const method=req.method; const p=url.pathname;
  if (p === '/api/health' && method==='GET') return json(res,200,{ok:true});
  if(p==='/api/auth/link-email'&&method==='POST'){
    const x=await body(req);required(x,['phone','password','email']);if(x.emailOptIn!==true)throw bad('Please agree to receive appointment emails.');
    const phone=normalizePhone(x.phone),email=normalizeEmail(x.email),user=db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
    if(!user||!passwordMatches(x.password,user.password_hash))throw bad('Phone number or password is incorrect.',401);
    if(db.prepare('SELECT id FROM users WHERE email=? AND id<>?').get(email,user.id))throw bad('That email address is already linked to another account.',409);
    db.exec('BEGIN IMMEDIATE');try{
      db.prepare('UPDATE users SET email=?,email_opt_in=1 WHERE id=?').run(email,user.id);
      if(user.patient_id)db.prepare('UPDATE patients SET email=? WHERE id=?').run(email,user.patient_id);
      if(user.doctor_id)db.prepare('UPDATE doctors SET email=? WHERE id=?').run(email,user.doctor_id);
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    setSession(res,user.id);const principal=db.prepare(`SELECT u.id,u.phone,u.email,u.role,u.patient_id,u.doctor_id,p.name patient_name,d.name doctor_name FROM users u LEFT JOIN patients p ON p.id=u.patient_id LEFT JOIN doctors d ON d.id=u.doctor_id WHERE u.id=?`).get(user.id);
    return json(res,200,{user:publicUser(principal)});
  }
  if(p==='/api/auth/signup'&&method==='POST'){
    const x=await body(req);required(x,['name','email','password','role']);const email=normalizeEmail(x.email);
    if(!['patient','doctor','admin'].includes(x.role))throw bad('Select Patient, Doctor, or Administrator.');
    if(x.password.length<10)throw bad('Password must be at least 10 characters.');
    if(x.role!=='admin'&&x.emailOptIn!==true)throw bad('Please agree to receive appointment emails.');
    if(db.prepare('SELECT id FROM users WHERE email=?').get(email))throw bad('An account already exists for this email address.',409);
    if(x.role==='admin'&&(!process.env.ADMIN_SIGNUP_CODE||x.adminCode!==process.env.ADMIN_SIGNUP_CODE))throw bad('Administrator signup code is invalid.',403);
    if(x.role==='patient'){
      const age=Number(x.age);if(!Number.isInteger(age)||age<0||age>130)throw bad('Enter a valid age.');
      if(!['Male','Female','Other'].includes(x.gender)||!['A+','A-','B+','B-','O+','O-','AB+','AB-'].includes(x.blood))throw bad('Select a valid gender and blood group.');
      if(!db.prepare('SELECT id FROM doctors WHERE id=?').get(x.doctorId))throw bad('Select a valid doctor.');
    }
    if(x.role==='doctor')required(x,['specialty','department']);
    db.exec('BEGIN IMMEDIATE');let userId;
    try{
      let patientId=null,doctorId=null;
      if(x.role==='patient'){
        patientId='P'+String(db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(id,2) AS INTEGER)),0)+1 n FROM patients").get().n).padStart(3,'0');
        db.prepare('INSERT INTO patients(id,name,age,gender,blood,phone,doctor_id,email,whatsapp_opt_in) VALUES(?,?,?,?,?,?,?,?,0)').run(patientId,x.name.trim(),Number(x.age),x.gender,x.blood,'',x.doctorId,email);
      }else if(x.role==='doctor'){
        doctorId='D'+String(db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(id,2) AS INTEGER)),0)+1 n FROM doctors").get().n).padStart(3,'0');
        const name=/^dr\.?\s/i.test(x.name.trim())?x.name.trim():`Dr. ${x.name.trim()}`;
        db.prepare('INSERT INTO doctors(id,name,specialty,department,phone,email,whatsapp_opt_in) VALUES(?,?,?,?,?,?,0)').run(doctorId,name,x.specialty.trim(),x.department.trim(),'',email);
      }
      const result=db.prepare('INSERT INTO users(email,email_opt_in,password_hash,role,patient_id,doctor_id) VALUES(?,?,?,?,?,?)').run(email,x.role==='admin'?0:1,passwordHash(x.password),x.role,patientId,doctorId);userId=Number(result.lastInsertRowid);db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    setSession(res,userId);const user=db.prepare(`SELECT u.id,u.phone,u.email,u.role,u.patient_id,u.doctor_id,p.name patient_name,d.name doctor_name FROM users u LEFT JOIN patients p ON p.id=u.patient_id LEFT JOIN doctors d ON d.id=u.doctor_id WHERE u.id=?`).get(userId);
    return json(res,201,{user:publicUser(user)});
  }
  if(p==='/api/auth/login'&&method==='POST'){
    const x=await body(req);required(x,['email','password']);const email=normalizeEmail(x.email),user=db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if(!user||!passwordMatches(x.password,user.password_hash))throw bad('Email or password is incorrect. If this is an older account without an email, use Link your email first.',401);
    setSession(res,user.id);const principal=db.prepare(`SELECT u.id,u.phone,u.email,u.role,u.patient_id,u.doctor_id,p.name patient_name,d.name doctor_name FROM users u LEFT JOIN patients p ON p.id=u.patient_id LEFT JOIN doctors d ON d.id=u.doctor_id WHERE u.id=?`).get(user.id);
    return json(res,200,{user:publicUser(principal)});
  }
  if(p==='/api/auth/logout'&&method==='POST'){
    const current=sessionUser(req);if(current)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(current.tokenHash);
    res.setHeader('Set-Cookie','hims_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return json(res,200,{ok:true});
  }
  if(p==='/api/auth/me'&&method==='GET'){const user=sessionUser(req);if(!user)throw bad('Please sign in.',401);return json(res,200,{user:publicUser(user)});}
  if(p==='/api/public/doctors'&&method==='GET')return json(res,200,db.prepare('SELECT id,name,specialty,department FROM doctors ORDER BY name').all());
  if(p==='/api/contact'&&method==='POST'){const x=await body(req);required(x,['name','email','message']);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email))throw bad('Enter a valid email address.');db.prepare('INSERT INTO contact_messages(name,email,message) VALUES(?,?,?)').run(x.name.trim(),x.email.trim(),x.message.trim());return json(res,201,{ok:true});}
  const user=sessionUser(req);if(!user)throw bad('Please sign in to continue.',401);
  if (p==='/api/patients' && method==='GET') {if(user.role==='patient')return json(res,200,[patientRow(db.prepare(patientSelect+' WHERE p.id=?').get(user.patient_id))]);if(user.role==='doctor')return json(res,200,db.prepare(patientSelect+' WHERE p.doctor_id=? ORDER BY p.id').all(user.doctor_id).map(patientRow));requireRole(user,['admin']);return json(res,200,db.prepare(patientSelect+' ORDER BY p.id').all().map(patientRow));}
  if (p==='/api/patients' && method==='POST') {
    requireRole(user,['admin']);
    const x=await body(req); required(x,['name','gender','blood','phone','doctor']);
    const age=Number(x.age); if(!Number.isInteger(age)||age<0||age>130) throw bad('Age must be between 0 and 130.');
    const doc=db.prepare('SELECT id FROM doctors WHERE id=? OR name=?').get(x.doctor,x.doctor); if(!doc) throw bad('Select a valid doctor.');
    const id='P'+String((db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(id,2) AS INTEGER)),0)+1 n FROM patients").get().n)).padStart(3,'0');
    db.prepare('INSERT INTO patients(id,name,age,gender,blood,phone,doctor_id) VALUES(?,?,?,?,?,?,?)').run(id,x.name.trim(),age,x.gender,x.blood,x.phone.trim(),doc.id);
    return json(res,201,patientRow(db.prepare(patientSelect+' WHERE p.id=?').get(id)));
  }
  let m=p.match(/^\/api\/patients\/([^/]+)$/);
  if(m&&method==='GET'){const id=decodeURIComponent(m[1]);requirePatientAccess(user,id);const row=db.prepare(patientSelect+' WHERE p.id=?').get(id); if(!row) throw bad('Patient not found.',404); return json(res,200,patientRow(row));}
  if(m&&method==='PUT'){requireRole(user,['admin']);const id=decodeURIComponent(m[1]),x=await body(req); required(x,['name','gender','blood','phone','doctor']); const age=Number(x.age);if(!Number.isInteger(age)||age<0||age>130)throw bad('Age must be between 0 and 130.'); const d=db.prepare('SELECT id FROM doctors WHERE id=? OR name=?').get(x.doctor,x.doctor);if(!d)throw bad('Select a valid doctor.'); const r=db.prepare('UPDATE patients SET name=?,age=?,gender=?,blood=?,phone=?,doctor_id=? WHERE id=?').run(x.name.trim(),age,x.gender,x.blood,x.phone.trim(),d.id,id);if(!r.changes)throw bad('Patient not found.',404);return json(res,200,patientRow(db.prepare(patientSelect+' WHERE p.id=?').get(id)));}
  if(m&&method==='DELETE'){requireRole(user,['admin']);const r=db.prepare('DELETE FROM patients WHERE id=?').run(decodeURIComponent(m[1]));if(!r.changes)throw bad('Patient not found.',404);return json(res,200,{ok:true});}
  if(p==='/api/doctors'&&method==='GET') return json(res,200,db.prepare(doctorSelect+' ORDER BY id').all());
  if(p==='/api/doctors'&&method==='POST'){requireRole(user,['admin']);const x=await body(req);required(x,['name','specialty','department','phone']);const id='D'+String(db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(id,2) AS INTEGER)),0)+1 n FROM doctors").get().n).padStart(3,'0');db.prepare('INSERT INTO doctors(id,name,specialty,department,phone) VALUES(?,?,?,?,?)').run(id,x.name.trim(),x.specialty.trim(),x.department.trim(),x.phone.trim());return json(res,201,db.prepare(doctorSelect+' WHERE id=?').get(id));}
  m=p.match(/^\/api\/doctors\/([^/]+)$/);if(m&&method==='PUT'){requireRole(user,['admin']);const id=decodeURIComponent(m[1]),x=await body(req);required(x,['name','specialty','department','phone']);const r=db.prepare('UPDATE doctors SET name=?,specialty=?,department=?,phone=? WHERE id=?').run(x.name.trim(),x.specialty.trim(),x.department.trim(),x.phone.trim(),id);if(!r.changes)throw bad('Doctor not found.',404);return json(res,200,db.prepare(doctorSelect+' WHERE id=?').get(id));}if(m&&method==='DELETE'){requireRole(user,['admin']);const r=db.prepare('DELETE FROM doctors WHERE id=?').run(decodeURIComponent(m[1]));if(!r.changes)throw bad('Doctor not found.',404);return json(res,200,{ok:true});}
  if(p==='/api/invoices'&&method==='GET'){if(user.role==='patient')return json(res,200,db.prepare(invoiceSelect+' WHERE i.patient_id=? ORDER BY i.id').all(user.patient_id));requireRole(user,['admin']);return json(res,200,db.prepare(invoiceSelect+' ORDER BY i.id').all());}
  if(p==='/api/invoices'&&method==='POST'){requireRole(user,['admin']);const x=await body(req);required(x,['patientId','date','description']);if(!validDate(x.date))throw bad('Enter a valid invoice date.');const amount=Number(x.amount);if(!Number.isFinite(amount)||amount<0)throw bad('Amount must be zero or greater.');if(!db.prepare('SELECT id FROM patients WHERE id=?').get(x.patientId))throw bad('Select a valid patient.');const id='INV-'+String(db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(id,5) AS INTEGER)),100)+1 n FROM invoices").get().n).padStart(3,'0');db.prepare('INSERT INTO invoices VALUES(?,?,?,?,?,?)').run(id,x.patientId,x.date,x.description.trim(),amount,'Unpaid');return json(res,201,db.prepare(invoiceSelect+' WHERE i.id=?').get(id));}
  m=p.match(/^\/api\/invoices\/([^/]+)$/);if(m&&method==='DELETE'){requireRole(user,['admin']);const r=db.prepare('DELETE FROM invoices WHERE id=?').run(decodeURIComponent(m[1]));if(!r.changes)throw bad('Invoice not found.',404);return json(res,200,{ok:true});}
  m=p.match(/^\/api\/invoices\/([^/]+)\/status$/);if(m&&method==='PATCH'){requireRole(user,['admin']);const x=await body(req);if(!['Paid','Unpaid'].includes(x.status))throw bad('Status must be Paid or Unpaid.');const r=db.prepare('UPDATE invoices SET status=? WHERE id=?').run(x.status,decodeURIComponent(m[1]));if(!r.changes)throw bad('Invoice not found.',404);return json(res,200,db.prepare(invoiceSelect+' WHERE i.id=?').get(decodeURIComponent(m[1])));}
  if(p==='/api/appointments'&&method==='GET'){let sql=appointmentSelect,args=[];if(user.role==='patient'){sql+=' WHERE a.patient_id=?';args.push(user.patient_id);}else if(user.role==='doctor'){sql+=' WHERE a.doctor_id=?';args.push(user.doctor_id);}else{requireRole(user,['admin']);if(url.searchParams.has('doctorId')){sql+=' WHERE a.doctor_id=?';args.push(url.searchParams.get('doctorId'));}if(url.searchParams.has('patientId')){sql+=(args.length?' AND':' WHERE')+' a.patient_id=?';args.push(url.searchParams.get('patientId'));}}return json(res,200,db.prepare(sql+' ORDER BY a.date,a.time').all(...args));}
  if(p==='/api/appointments'&&method==='POST'){requireRole(user,['patient']);const x=await body(req);required(x,['date','time','doctor','reason','symptoms']);if(!validDate(x.date))throw bad('Enter a valid appointment date.');if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.time))throw bad('Enter a valid appointment time.');const d=db.prepare('SELECT id FROM doctors WHERE id=? OR name=?').get(x.doctor,x.doctor);if(!d)throw bad('Select a valid doctor.');const r=db.prepare('INSERT INTO appointments(patient_id,doctor_id,date,time,reason,symptoms,status) VALUES(?,?,?,?,?,?,?)').run(user.patient_id,d.id,x.date,x.time,x.reason.trim(),x.symptoms.trim(),'Pending');void notifyAppointment(Number(r.lastInsertRowid),'booked');return json(res,201,db.prepare(appointmentSelect+' WHERE a.id=?').get(r.lastInsertRowid));}
  m=p.match(/^\/api\/appointments\/(\d+)$/);if(m&&method==='PATCH'){requireRole(user,['doctor','admin']);const id=Number(m[1]),appt=db.prepare('SELECT * FROM appointments WHERE id=?').get(id);if(!appt)throw bad('Appointment not found.',404);if(user.role==='doctor'&&appt.doctor_id!==user.doctor_id)throw bad('You do not have permission to update this appointment.',403);const x=await body(req);if(x.status!=='Completed')throw bad('Appointment status is invalid.');db.prepare("UPDATE appointments SET status='Completed' WHERE id=?").run(id);void notifyAppointment(id,'completed');return json(res,200,db.prepare(appointmentSelect+' WHERE a.id=?').get(id));}if(m&&method==='DELETE'){const id=Number(m[1]),appt=db.prepare('SELECT * FROM appointments WHERE id=?').get(id);if(!appt)throw bad('Appointment not found.',404);if(user.role==='patient'){if(appt.patient_id!==user.patient_id||appt.status==='Completed')throw bad('You cannot cancel this appointment.',403);}else requireRole(user,['admin']);void notifyAppointment(id,'cancelled');db.prepare('DELETE FROM appointments WHERE id=?').run(id);return json(res,200,{ok:true});}
  m=p.match(/^\/api\/patients\/([^/]+)\/lab-results$/);if(m&&method==='GET'){const pid=decodeURIComponent(m[1]);requirePatientAccess(user,pid);if(!db.prepare('SELECT id FROM patients WHERE id=?').get(pid))throw bad('Patient not found.',404);return json(res,200,db.prepare('SELECT * FROM lab_results WHERE patient_id=? ORDER BY date DESC,id DESC').all(pid));}
  m=p.match(/^\/api\/patients\/([^/]+)\/(diagnoses|prescriptions)$/);
  if(m){const pid=decodeURIComponent(m[1]),type=m[2];requirePatientAccess(user,pid);if(!db.prepare('SELECT id FROM patients WHERE id=?').get(pid))throw bad('Patient not found.',404);const table=type==='diagnoses'?'diagnoses':'prescriptions';if(method==='GET'){const join=type==='diagnoses'?'diagnoses x LEFT JOIN doctors d ON d.id=x.doctor_id':'prescriptions x LEFT JOIN doctors d ON d.id=x.doctor_id';return json(res,200,db.prepare(`SELECT x.*,COALESCE(d.name,'') doctor FROM ${join} WHERE x.patient_id=? ORDER BY x.date DESC,x.id DESC`).all(pid));}if(method==='POST'){requireRole(user,['doctor','admin']);if(user.role==='doctor'&&db.prepare('SELECT id FROM patients WHERE id=? AND doctor_id=?').get(pid,user.doctor_id)===undefined)throw bad('You are not assigned to this patient.',403);const x=await body(req);const fields=type==='diagnoses'?['date','diagnosis','notes']:['date','medicine','dosage','duration'];required(x,fields);if(!validDate(x.date))throw bad('Enter a valid date.');const doctorId=user.role==='doctor'?user.doctor_id:(x.doctorId||'D001');if(type==='diagnoses'){const r=db.prepare('INSERT INTO diagnoses(patient_id,doctor_id,date,diagnosis,notes) VALUES(?,?,?,?,?)').run(pid,doctorId,x.date,x.diagnosis.trim(),x.notes.trim());return json(res,201,db.prepare('SELECT * FROM diagnoses WHERE id=?').get(r.lastInsertRowid));}const r=db.prepare('INSERT INTO prescriptions(patient_id,doctor_id,date,medicine,dosage,duration) VALUES(?,?,?,?,?,?)').run(pid,doctorId,x.date,x.medicine.trim(),x.dosage.trim(),x.duration.trim());return json(res,201,db.prepare('SELECT * FROM prescriptions WHERE id=?').get(r.lastInsertRowid));}}
  m=p.match(/^\/api\/(diagnoses|prescriptions)\/(\d+)$/);if(m&&(method==='PUT'||method==='DELETE')){const table=m[1],id=Number(m[2]),record=db.prepare(`SELECT patient_id FROM ${table} WHERE id=?`).get(id);if(!record)throw bad('Record not found.',404);requirePatientAccess(user,record.patient_id);requireRole(user,['doctor','admin']);if(user.role==='doctor'&&!db.prepare('SELECT id FROM patients WHERE id=? AND doctor_id=?').get(record.patient_id,user.doctor_id))throw bad('You are not assigned to this patient.',403);if(method==='DELETE'){db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);return json(res,200,{ok:true});}const x=await body(req);required(x,table==='diagnoses'?['date','diagnosis','notes']:['date','medicine','dosage','duration']);if(!validDate(x.date))throw bad('Enter a valid date.');let r;if(table==='diagnoses')r=db.prepare('UPDATE diagnoses SET date=?,diagnosis=?,notes=? WHERE id=?').run(x.date,x.diagnosis.trim(),x.notes.trim(),id);else r=db.prepare('UPDATE prescriptions SET date=?,medicine=?,dosage=?,duration=? WHERE id=?').run(x.date,x.medicine.trim(),x.dosage.trim(),x.duration.trim(),id);return json(res,200,db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id));}
  if(p==='/api/reset'&&method==='POST'){
    requireRole(user,['admin']);
    const reset=()=>{
      db.exec('BEGIN IMMEDIATE');
      try {
      db.exec('DELETE FROM notification_log; DELETE FROM contact_messages; DELETE FROM lab_results; DELETE FROM prescriptions; DELETE FROM diagnoses; DELETE FROM appointments; DELETE FROM invoices; DELETE FROM patients; DELETE FROM doctors; DELETE FROM sqlite_sequence;');
      const doctor=db.prepare('INSERT INTO doctors(id,name,specialty,department,phone) VALUES (?,?,?,?,?)');doctor.run('D001','Dr. Sarah Lee','General Physician','Internal Medicine','+1 800 555 0401');doctor.run('D002','Dr. Raj Patel','Cardiologist','Cardiology','+1 800 555 0402');doctor.run('D003','Dr. Amir Khan','Orthopaedist','Orthopaedics','+1 800 555 0403');
      const patient=db.prepare('INSERT INTO patients(id,name,age,gender,blood,phone,doctor_id,dob,email,address,emergency_contact) VALUES (?,?,?,?,?,?,?,?,?,?,?)');patient.run('P001','John Smith',45,'Male','O+','+1 800 555 0101','D001','1980-03-12','john.smith@email.com','12 Elm Street, San Francisco, CA','Jane Smith +1 800 555 0202');patient.run('P002','Mary Johnson',32,'Female','A+','+1 800 555 0202','D001','1993-07-05','mary.j@email.com','45 Oak Avenue, Los Angeles, CA','');patient.run('P003','Alan Brown',60,'Male','B-','+1 800 555 0303','D002','1965-11-18','alan.b@email.com','78 Pine Road, San Diego, CA','');
      const invoice=db.prepare('INSERT INTO invoices VALUES (?,?,?,?,?,?)');invoice.run('INV-101','P001','2026-02-20','Consultation',80,'Paid');invoice.run('INV-102','P001','2026-02-18','Lab Tests',150,'Unpaid');invoice.run('INV-103','P001','2026-01-10','Routine Check-up',60,'Paid');
      const appointment=db.prepare('INSERT INTO appointments(patient_id,doctor_id,date,time,reason,symptoms,status) VALUES (?,?,?,?,?,?,?)');appointment.run('P001','D001','2026-03-05','09:00','Follow-up','Mild chest discomfort','Pending');appointment.run('P002','D001','2026-03-05','11:00','Consultation','Fatigue','Pending');appointment.run('P003','D001','2026-03-18','14:00','Lab Review','Joint pain','Pending');appointment.run('P001','D002','2026-02-20','10:00','Consultation','Headache, high BP','Completed');appointment.run('P001','D003','2026-01-10','14:00','Check-up','Routine check','Completed');
      db.prepare('INSERT INTO diagnoses(patient_id,doctor_id,date,diagnosis,notes) VALUES (?,?,?,?,?)').run('P001','D001','2026-02-20','Hypertension','Blood pressure elevated. Monitor weekly.');db.prepare('INSERT INTO diagnoses(patient_id,doctor_id,date,diagnosis,notes) VALUES (?,?,?,?,?)').run('P001','D002','2026-01-10','Routine Check','All vitals normal.');db.prepare('INSERT INTO prescriptions(patient_id,doctor_id,date,medicine,dosage,duration) VALUES (?,?,?,?,?,?)').run('P001','D001','2026-02-20','Amlodipine','5mg once daily','30 days');
      const lab=db.prepare('INSERT INTO lab_results(patient_id,date,test,result,normal_range,status) VALUES (?,?,?,?,?,?)');lab.run('P001','2026-02-18','Blood Pressure','145/95 mmHg','120/80 mmHg','High');lab.run('P001','2026-02-18','Blood Sugar (Fasting)','98 mg/dL','70-100 mg/dL','Normal');
      db.exec('COMMIT');
      } catch(error) { db.exec('ROLLBACK'); throw error; }
    };reset();return json(res,200,{ok:true});
  }
  return json(res,404,{error:'API endpoint not found.'});
}

const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml'};
const dashboardPaths={'/patient.html':'patient','/doctor.html':'doctor','/admin.html':'admin'};
const dashboardForRole={patient:'/patient.html',doctor:'/doctor.html',admin:'/admin.html'};
const routeAliases={'/patient':'/patient.html','/doctor':'/doctor.html','/admin':'/admin.html','/login':'/login.html','/signup':'/signup.html'};
const publicPages=new Set(['index.html','role.html','login.html','signup.html','link-email.html']);
const publicScripts=new Set(['api.js','auth.js','account-migration.js','auth-guard.js','main.js','role.js','dashboard.js','patient.js','doctor.js','admin.js','reset.js']);
const publicStyles=new Set(['style.css','dashboard.css','patient.css','doctor.css','admin.css','auth.css']);
const server=http.createServer(async(req,res)=>{try{if(req.url.startsWith('/api/'))return await route(req,res);const requestedPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const pathname=routeAliases[requestedPath]||requestedPath;if(dashboardPaths[pathname]){const current=sessionUser(req);if(!current){res.writeHead(302,{Location:'/login.html'});return res.end();}if(current.role!==dashboardPaths[pathname]){res.writeHead(302,{Location:dashboardForRole[current.role]});return res.end();}}const relative=pathname==='/'?'index.html':pathname.slice(1);const file=path.resolve(ROOT,relative);if(!file.startsWith(ROOT+path.sep))return json(res,403,{error:'Forbidden.'});const isImage=relative.startsWith('images/')||relative.startsWith('images\\');const allowed=dashboardPaths[pathname]!==undefined||publicPages.has(relative)||publicScripts.has(relative)||publicStyles.has(relative)||(isImage&&/\.(png|jpe?g|svg|webp|ico)$/i.test(relative));if(!allowed||!fs.existsSync(file)||!fs.statSync(file).isFile())return json(res,404,{error:'File not found.'});res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch(error){if(!error.status||error.status>=500)console.error(error);json(res,error.status||500,{error:error.status?error.message:'Request failed. Check the server log.'});}});
server.listen(port,'127.0.0.1',()=>console.log(`HIMS is running at http://localhost:${port}`));
