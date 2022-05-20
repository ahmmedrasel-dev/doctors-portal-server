const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require('mongodb');
const nodemailer = require("nodemailer");
const mandrillTransport = require('nodemailer-mandrill-transport');

// Middleware.
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.nstmr.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

//Varify Jwt
function verifyJWT(req, res, next) {
  // Client Sit the reviece korbo.
  const authHeader = req.headers.authorization;
  // Url dia api hit korle token na thakle data paoya jabe na.
  // console.log(authHeader)
  if (!authHeader) {
    return res.status(401).send({ message: 'Unauthorization access' })
  }
  // Client thek poya token ke splite dia ber kore neoya.
  const token = authHeader.split(' ')[1];
  // console.log(process.env.ACCESS_TOKEN_SECRET);

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decode) {
    // Client site er token ta valid kina check kora.
    if (err) {
      console.log(err)
      return res.status(403).send({ message: 'Forbidden Access!' })
    }
    // Valid hole req thek token ke decode kore chek korbe.
    req.decode = decode;
    // Sob thik thake next() dia baki kaj gulo korbe.
    next()
  });
  // console.log(authHeader)
}

const smtpTransport = nodemailer.createTransport(mandrillTransport({
  auth: {
    apiKey: process.env.EMAIL_SEDER_KEY,
  }
}));

function sendAppoinmentEmail(booking) {
  const { teatmentName, date, slot, patiendEmail, patientName } = booking;
  let email = {
    from: process.env.FROM_EMAIL,
    to: patiendEmail,
    subject: `Your appoinment for ${teatmentName} is on ${date} at ${slot} is Confirmed.`,
    text: `Your appoinment for ${teatmentName} is on ${date} at ${slot} is Confirmed.`,
    html: `
    <div>
    <p>Hello, ${patientName}</p>
    <h3>Your appoinment for ${teatmentName} is Confirmed.</h3>
    <p>Looking forword to See you on ${date} at ${slot}</p>
    <h3>Our Address</h3>
    <p>King abdulaziz Road</p>
    <p>Dammam, Saudi Arabia</p>
    <a href="httts://raselweb.net">unsubscribe</a>
    </div>`
  }
}

async function run() {
  try {
    await client.connect();
    const servicesCollection = client.db('doctors_portal').collection("services");
    const bookignCollection = client.db('doctors_portal').collection('bookings');
    const usersCollection = client.db('doctors_portal').collection('users');
    const doctorsCollection = client.db('doctors_portal').collection('doctors')

    const verifyAdmin = async (req, res, next) => {
      const requester = req.decode.email;
      const requesterAccount = await usersCollection.findOne({ email: requester });

      if (requesterAccount.role === 'admin') {
        next()
      }
      else {
        res.status(403).send({ message: 'Forbidden Access!' })
      }
    }

    app.get('/services', async (req, res) => {
      const query = {};
      const cursor = servicesCollection.find(query).project({ name: 1 });
      const services = await cursor.toArray();
      res.send(services)
    })

    app.get('/admin/:email', async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      const isAdmin = user.role === 'admin';
      res.send({ admin: isAdmin })
    })

    // Post Doctor to Databse.
    app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = doctorsCollection.insertOne(doctor);
      res.send({ success: true, message: 'Doctor Inserted!' })
    })

    // Get all Doctor,
    app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
      const doctors = await doctorsCollection.find().toArray();
      res.send(doctors)
    })

    // Delete Doctor,
    app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email
      const filter = { email: email }
      const doctors = await doctorsCollection.deleteOne(filter);
      res.send(doctors)
    })

    // Inster or Update User to Database.
    app.put('/user/admin/:email', async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updateUser = {
        $set: { role: 'admin' }
      }
      const result = await usersCollection.updateOne(filter, updateUser);
      res.send(result);
    })

    // Inster or Update User to Database.
    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      console.log(email)
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateUser = {
        $set: user,
      }
      const result = await usersCollection.updateOne(filter, updateUser, options);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
      res.send({ result, token });
    })

    // Get All Users Data
    app.get('/users', verifyJWT, async (req, res) => {
      const query = {};
      const users = await usersCollection.find(query).toArray();
      res.send(users);
    })

    // Get My Appoinment Booking 
    app.get('/booking', verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodeEmail = req.decode.email
      if (patient === decodeEmail) {
        const query = { patiendEmail: patient };
        const bookings = await bookignCollection.find(query).toArray();
        res.send(bookings);
      } else {
        return res.status(403).send({ message: 'Forbidden Access!' })
      }
    })

    // this is not the proper way to query.
    // use agregate lookup, pipeline, match, group.
    app.get('/available', async (req, res) => {
      const date = req.query.date;

      // 1st step get all servicee from servicescollection.
      const services = await servicesCollection.find().toArray();
      // 2nd step is get all booking of the day.
      const query = { date: date };
      const bookings = await bookignCollection.find(query).toArray();

      // 3rd Step is for each service do sometinh.
      services.forEach(service => {
        // 4th step is find the bookings for that service.
        const servicesBookings = bookings.filter(bitem => bitem.teatmentName === service.name);
        // 5th step is select slot for the service bookings.
        const booked = servicesBookings.map(sbitem => sbitem.slot);
        // 6th select those slot their are not in bookes slot.
        const available = service.slots.filter(s => !booked.includes(s));
        service.slots = available

      })
      res.send(services);
    })
    // Booking
    app.post('/booking', async (req, res) => {
      const booking = req.body;
      const query = { date: booking.date, patientName: booking.patientName };
      const existBooking = await bookignCollection.findOne(query)
      if (existBooking) {
        return res.send({ success: false, message: 'Booking Already Exist.' })
      }
      await bookignCollection.insertOne(booking);
      console.log('sending Email')
      sendAppoinmentEmail(booking);
      res.send({ success: true, message: 'Booking Set!' })
    })
    console.log('databse connected')
  }
  finally {
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello Doctors Portal')
})

app.listen(port, () => {
  console.log(`Doctors App listing from Port ${port}`)
})