const express = require("express")  
const sqlite3 = require("sqlite3").verbose()
const cors = require("cors")
const bodyParser = require("body-parser")
const nodemailer = require("nodemailer")
const Stripe = require("stripe")
const { v4: uuidv4 } = require("uuid")

const app = express()
app.use(cors({
  origin: "*"
}))
app.use(bodyParser.json())

const stripe = new Stripe("sk_test_yourkey") // replace with your key

const db = new sqlite3.Database("./engineernet.db", (err)=>{
 if(err) console.log(err)
 else console.log("Database connected")
})

/* ================= OTP ================= */

let otpStore = {}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "your_email@gmail.com",
    pass: "your_app_password"
  }
})

app.post("/send-otp",(req,res)=>{
  const { email } = req.body
  const otp = Math.floor(100000 + Math.random()*900000).toString()

  otpStore[email] = otp

  transporter.sendMail({
    from: "EngineerNet",
    to: email,
    subject: "Your OTP Code",
    text: `Your OTP is ${otp}`
  })

  res.json({message:"OTP sent"})
})

app.post("/verify-otp",(req,res)=>{
  const { email, otp } = req.body

  if(otpStore[email] === otp){
    delete otpStore[email]
    res.json({success:true})
  }else{
    res.json({success:false})
  }
})

/* ================= TABLES ================= */

db.run(`CREATE TABLE IF NOT EXISTS suppliers (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT,
 email TEXT UNIQUE,
 phone TEXT,
 department TEXT,
 job_title TEXT,
 company_name TEXT,
 company_email TEXT,
 company_phone TEXT,
 registration_number TEXT,
 business_address TEXT,
 password TEXT,
 rating REAL DEFAULT 5,
 total_ratings INTEGER DEFAULT 1,
 role TEXT DEFAULT 'supplier'
)`)

db.run(`CREATE TABLE IF NOT EXISTS buyers (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT,
 email TEXT UNIQUE,
 phone TEXT,
 location TEXT,
 company_name TEXT,
 department TEXT,
 job_title TEXT,
 password TEXT
)`)

db.run(`CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT,
 category TEXT,
 price REAL,
 description TEXT,
 image TEXT,
 supplier_id INTEGER
)`)

db.run(`CREATE TABLE IF NOT EXISTS rfq (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 product TEXT,
 quantity INTEGER,
 location TEXT,
 buyer_id INTEGER,
 status TEXT DEFAULT 'open'
)`)

db.run(`CREATE TABLE IF NOT EXISTS quotes (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 rfq_id INTEGER,
 price REAL,
 delivery TEXT,
 supplier_id INTEGER
)`)

db.run(`CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 rfq_id INTEGER,
 supplier_id INTEGER,
 amount REAL,
 status TEXT,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`)

/* ================= AUTH ================= */

app.post("/register-buyer",(req,res)=>{
 const {name,email,phone,location,company_name,department,job_title,password} = req.body

 db.run(`INSERT INTO buyers 
 (name,email,phone,location,company_name,department,job_title,password)
 VALUES (?,?,?,?,?,?,?,?)`,
 [name,email,phone,location,company_name,department,job_title,password],
 function(err){
  if(err) return res.json({error:err.message})
  res.json({message:"Buyer registered"})
 })
})

app.post("/register-supplier",(req,res)=>{
 const {
  name,email,phone,department,job_title,
  company_name,company_email,company_phone,
  registration_number,business_address,password
 } = req.body

 db.run(`INSERT INTO suppliers 
 (name,email,phone,department,job_title,
  company_name,company_email,company_phone,
  registration_number,business_address,password)
 VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
 [
  name,email,phone,department,job_title,
  company_name,company_email,company_phone,
  registration_number,business_address,password
 ],
 function(err){
  if(err) return res.json({error:err.message})
  res.json({message:"Supplier registered"})
 })
})

app.post("/login-buyer",(req,res)=>{
 const {email,password} = req.body

 db.get(`SELECT * FROM buyers WHERE email=? AND password=?`,
 [email,password],
 (err,row)=>{
  if(err) return res.json({error:err.message})
  if(!row) return res.json({error:"Invalid credentials"})
  res.json({user:row})
 })
})

app.post("/login-supplier",(req,res)=>{
 const {company_email,password} = req.body

 db.get(`SELECT * FROM suppliers WHERE company_email=? AND password=?`,
 [company_email,password],
 (err,row)=>{
  if(err) return res.json({error:err.message})
  if(!row) return res.json({error:"Invalid credentials"})
  res.json({user:row})
 })
})

/* ================= PRODUCTS ================= */

app.post("/add-product",(req,res)=>{
 const {name,category,price,description,image,supplier_id}=req.body

 db.run(`INSERT INTO products (name,category,price,description,image,supplier_id)
 VALUES (?,?,?,?,?,?)`,
 [name,category,price,description,image,supplier_id],
 function(err){
  if(err) return res.json({error:err.message})
  res.json({message:"Product added"})
 })
})

app.get("/products",(req,res)=>{
 db.all(`SELECT * FROM products`,[],(err,rows)=>{
  res.json(rows)
 })
})

/* ================= SINGLE PRODUCT ================= */

app.get("/product/:id",(req,res)=>{
 const id = req.params.id

 db.get(`
  SELECT products.*, suppliers.company_name, suppliers.rating
  FROM products
  LEFT JOIN suppliers ON products.supplier_id = suppliers.id
  WHERE products.id = ?
 `,
 [id],
 (err,row)=>{
  if(err){
    return res.json({error:err.message})
  }
  res.json(row)
 })
})

/* ================= RFQ + QUOTES ================= */

app.post("/create-rfq",(req,res)=>{
 const {product,quantity,location,buyer_id}=req.body

 db.run(`INSERT INTO rfq (product,quantity,location,buyer_id)
 VALUES (?,?,?,?)`,
 [product,quantity,location,buyer_id],
 function(err){
  if(err) return res.json({error:err.message})
  res.json({message:"RFQ created"})
 })
})

app.get("/rfq",(req,res)=>{
 db.all(`SELECT * FROM rfq`,[],(err,rows)=>{
  res.json(rows)
 })
})

app.post("/submit-quote",(req,res)=>{
 const {rfq_id,price,delivery,supplier_id}=req.body

 db.run(`INSERT INTO quotes (rfq_id,price,delivery,supplier_id)
 VALUES (?,?,?,?)`,
 [rfq_id,price,delivery,supplier_id],
 function(err){
  if(err) return res.json({error:err.message})
  res.json({message:"Quote submitted"})
 })
})

app.get("/quotes/:rfq_id",(req,res)=>{
 const rfq_id = req.params.rfq_id

 db.all(`
  SELECT quotes.*, suppliers.rating 
  FROM quotes 
  JOIN suppliers ON quotes.supplier_id = suppliers.id
  WHERE rfq_id=?
 `,[rfq_id],(err,rows)=>{

  if(!rows || rows.length === 0){
    return res.json([])
  }

  const ranked = rows.map(q=>{
    const deliveryDays = parseInt(q.delivery)||7
    const score = (q.price*0.6)+(deliveryDays*0.3)-(q.rating*10*0.1)
    return {...q,score}
  })

  ranked.sort((a,b)=>a.score-b.score)
  res.json(ranked)
 })
})

/* ================= STRIPE ================= */

app.post("/create-checkout-session", async (req,res)=>{
  const { amount } = req.body

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "EngineerNet Order"
          },
          unit_amount: amount * 100
        },
        quantity: 1
      }
    ],
    success_url: "http://localhost:3000/payment-success",
    cancel_url: "http://localhost:3000/cart"
  })

  res.json({url: session.url})
})

/* ================= PAYNOW ================= */

app.post("/paynow-payment",(req,res)=>{
 const { amount } = req.body

 db.run(`INSERT INTO orders (rfq_id,supplier_id,amount,status)
 VALUES (?,?,?,?)`,
 [1,1,amount,"paid"],
 ()=>{
  res.json({message:"Payment successful"})
 })
})

/* ================= ORDERS ================= */

app.post("/create-order",(req,res)=>{
 const {rfq_id,supplier_id,amount}=req.body

 db.run(`INSERT INTO orders (rfq_id,supplier_id,amount,status)
 VALUES (?,?,?,?)`,
 [rfq_id,supplier_id,amount,"paid"],
 function(err){
  if(err) return res.json({error:err.message})
  res.json({message:"Payment successful"})
 })
})

app.get("/orders",(req,res)=>{
 db.all(`SELECT * FROM orders`,[],(err,rows)=>{
  res.json(rows)
 })
})

/* ================= RATING ================= */

app.post("/rate",(req,res)=>{
 const {supplier_id,rating}=req.body

 db.get(`SELECT rating,total_ratings FROM suppliers WHERE id=?`,
 [supplier_id],
 (err,row)=>{

  const newTotal = row.total_ratings + 1
  const newRating = ((row.rating * row.total_ratings) + rating) / newTotal

  db.run(`UPDATE suppliers SET rating=?, total_ratings=? WHERE id=?`,
  [newRating,newTotal,supplier_id],
  ()=> res.json({message:"Rated"})
 })
})

/* ================= START ================= */

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log("Server running on port " + PORT)
})