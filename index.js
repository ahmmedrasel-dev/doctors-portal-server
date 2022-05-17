const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require('mongodb');


// Middleware.
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.nstmr.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
  try {
    await client.connect();
    const servicesCollection = client.db('doctors_portal').collection("services");
    const bookignCollection = client.db('doctors_portal').collection('bookings');
    const usersCollection = client.db('doctors_portal').collection('users');

    app.get('/services', async (req, res) => {
      const query = {};
      const cursor = servicesCollection.find(query);
      const services = await cursor.toArray();
      res.send(services)
    })

    // Inster or Update User to Database.
    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateUser = {
        $set: user,
      }
      const result = await usersCollection.updateOne(filter, updateUser, options);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
      res.send({ result, accessToken: token });
    })
    // Get Booking 
    app.get('/booking', async (req, res) => {
      const patient = req.query.patient;
      const query = { patiendEmail: patient };
      const bookings = await bookignCollection.find(query).toArray();
      res.send(bookings);
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
      res.send({ success: true, message: 'Data Inserted!' })
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