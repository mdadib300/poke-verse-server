const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const port = process.env.PORT || 5000;
const nodemailer = require("nodemailer");


// Middleware
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Hello World!')
})


const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

//order confirmation to user + admin
const sendOrderEmails = async (order) => {
  try {
    // Convert cart items to HTML string
    const cartItemsHtml = order.cartItems.map(cartItem => {
      return `
        <tr>
          <td style="padding: 5px; border: 1px solid #ddd;">${cartItem.title}</td>
          <td style="padding: 5px; border: 1px solid #ddd;">${cartItem.size}</td>
          <td style="padding: 5px; border: 1px solid #ddd;">${cartItem.color || ''}</td>
          <td style="padding: 5px; border: 1px solid #ddd;">${cartItem.quantity}</td>
          <td style="padding: 5px; border: 1px solid #ddd;">${cartItem.price} BDT</td>
        </tr>
      `;
    }).join('');

    // ---------------- Email to Customer ----------------
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: order.email,
      subject: "Order Confirmation - PokéVerse BD",
      html: `
        <h2>Hi ${order.name},</h2>
        <p>Thank you for your order!</p>
        <p>Here are your order details:</p>
        <table style="border-collapse: collapse; width: 100%;">
          <thead>
            <tr>
              <th style="padding: 5px; border: 1px solid #ddd;">Product</th>
              <th style="padding: 5px; border: 1px solid #ddd;">Size</th>
              <th style="padding: 5px; border: 1px solid #ddd;">Color</th>
              <th style="padding: 5px; border: 1px solid #ddd;">Quantity</th>
              <th style="padding: 5px; border: 1px solid #ddd;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${cartItemsHtml}
          </tbody>
        </table>
        <p><b>Total Amount To Pay: ${order.amount} BDT</b></p>
        <p>Best Regards,</p>
        <p>PokéVerse BD Team</p>
      `,
    });

    // ---------------- Email to Admin ----------------
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.SMTP_USER, // Admin email
      subject: "New Order Received",
      html: `
        <h3>New Order Received</h3>
        <p><b>Customer:</b> ${order.name}</p>
        <p><b>Email:</b> ${order.email}</p>
        <p><b>Phone:</b> ${order.phone}</p>
        <p><b>Address:</b> ${order.address}</p>
        <p><b>Delivery Location:</b> ${order.deliveryLocation}</p>
        <p><b>Ordered at:</b> ${order.orderTime.slice(0, 10)}</p>
        <p><b>Payment Method:</b> ${order.paymentMethod}</p>
        <p><b>Discount:</b> ${order.discountPercent || 0}%</p>
        <p><b>Total Amount:</b> ${order.amount} BDT</p>
        <h4>Products:</h4>
        <table style="border-collapse: collapse; width: 100%;">
          <thead>
            <tr>
              <th style="padding: 5px; border: 1px solid #ddd;">Product</th>
              <th style="padding: 5px; border: 1px solid #ddd;">Size</th>
              <th style="padding: 5px; border: 1px solid #ddd;">Color</th>
              <th style="padding: 5px; border: 1px solid #ddd;">Quantity</th>
              <th style="padding: 5px; border: 1px solid #ddd;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${cartItemsHtml}
          </tbody>
        </table>
      `,
    });

    console.log("✅ Order emails sent successfully.");
  } catch (error) {
    console.error("❌ Error sending emails:", error);
  }
};



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@xpointcluster.j3qynmm.mongodb.net/?appName=XpointCluster`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const productsColl = client.db("pokeDB").collection("productsColl");
        const cartsColl = client.db("pokeDB").collection("cartsColl");
        const usersColl = client.db("pokeDB").collection("usersColl");
        const ordersColl = client.db("pokeDB").collection("ordersColl");
        const slidersColl = client.db("pokeDB").collection("slidersColl");
        const couponsColl = client.db("pokeDB").collection("couponsColl");
        const categoriesColl = client.db("pokeDB").collection("categoriesColl");

        // JWT Related API
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1h'
            });
            res.send({ token });
        })

        // middlewares
        // ----------verifyToken: checks the user is logged in or not--------
        const verifyToken = (req, res, next) => {
            console.log(req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'Forbidded Access' })
                }
                req.decoded = decoded;

                next();
            })
        }

        // Use verify admin after verifyToken
        // --------checks the user is admin or not----------
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersColl.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'Forbidden access' });
            }
            next();
        }

        // send users data to DB
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await usersColl.findOne(query);
            if (existingUser) {
                return res.send({ message: 'User already exists', insertedId: null })
            }
            const result = await usersColl.insertOne(user);
            res.send(result);
        })

        // load all users
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            console.log(req.headers);
            const result = await usersColl.find().toArray();
            res.send(result);
        })

        // make user admin
        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersColl.updateOne(filter, updatedDoc);
            res.send(result);
        })

        // delete user
        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await usersColl.deleteOne(query);
            res.send(result);
        })

        // Check if the user is admin or not
        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;

            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'Unauthorized Access' })
            }
            const query = { email: email };
            const user = await usersColl.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        })

        // Load all categories 
        app.get('/categories', async (req, res) => {
            const result = await categoriesColl.find().toArray();
            res.send(result);
        })

        // adding products in the products server (ADMIN ONLY)
        app.post('/categories', verifyToken, verifyAdmin, async (req, res) => {
            const categoryInfo = req.body;
            const result = await categoriesColl.insertOne(categoryInfo);
            res.send(result);
        })

        // Load all products 
        app.get('/products', async (req, res) => {
            const result = await productsColl.find().toArray();
            res.send(result);
        })

        // adding products in the products server (ADMIN ONLY)
        app.post('/products', verifyToken, verifyAdmin, async (req, res) => {
            const productInfo = req.body;
            const result = await productsColl.insertOne(productInfo);
            res.send(result);
        })

        // deleting product form the products server (ADMIN ONLY)
        app.delete('/products/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await productsColl.deleteOne(query);
            res.send(result);
        })

        // Updating a product info (ADMIN ONLY)
        // Getting the info first
        app.get('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await productsColl.findOne(query);
            res.send(result);
        })
        // Now patching the info
        app.patch('/products/:id', verifyToken, verifyAdmin, async (req, res) => {
            const product = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    title: product.title,
                    description: product.description,
                    category: product.category,
                    price: product.price,
                    sizes: product.sizes,
                    colors: product.colors,
                    images: product.images
                }
            }
            const result = await productsColl.updateOne(filter, updatedDoc);
            res.send(result);
        })

        // Getting product details when clicked on see details
        app.get('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await productsColl.findOne(query);
            res.send(result);
        })

        // add all carts to database
        app.post('/carts', async (req, res) => {
            const cartItem = req.body;
            const result = await cartsColl.insertOne(cartItem);
            res.send(result);
        })

        // load specific user's carts 
        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await cartsColl.find(query).toArray();
            res.send(result);
        })

        // Delete single cart item
        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartsColl.deleteOne(query);
            res.send(result);
        })


        // Place order and send emails
        app.post('/orders', async (req, res) => {
            const order = req.body;

            // INSERT order into DB
            const result = await ordersColl.insertOne(order);

            // ---- CHANGE: Send email notifications ----
            await sendOrderEmails(order);

            res.send(result);
        });

        // getting the order info for the specific user
        app.get('/orders', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const cursor = ordersColl.find(query);
            const orders = await cursor.toArray();
            res.send(orders);
        })

        // cancel order from user dashboard orders
        app.delete('/orders/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await ordersColl.deleteOne(query);
            res.send(result);
        })

        // Get all orders (ADMIN ONLY)
        app.get('/allOrders', verifyToken, verifyAdmin, async (req, res) => {
            const result = await ordersColl.find().toArray();
            res.send(result);
        });

        // Order cancel or confirm (ADMIN ONLY)
        app.patch('/orders/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const { status } = req.body;
            const result = await ordersColl.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status: status } }
            );
            res.send(result);
        });

        // order delete (ADMIN ONLY)
        app.delete('/orders/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const result = await ordersColl.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // Load all Slider images 
        app.get('/sliders', async (req, res) => {
            const result = await slidersColl.find().toArray();
            res.send(result);
        })

        // adding slider images in the sliders server (ADMIN ONLY)
        app.post('/sliders', verifyToken, verifyAdmin, async (req, res) => {
            const sliderInfo = req.body;
            const result = await slidersColl.insertOne(sliderInfo);
            res.send(result);
        })

        // deleting slider image form the sliders server (ADMIN ONLY)
        app.delete('/sliders/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await slidersColl.deleteOne(query);
            res.send(result);
        })

        // Get all coupons (Admin)
        app.get("/coupons", verifyToken, verifyAdmin, async (req, res) => {
            const coupons = await couponsColl.find().toArray();
            res.send(coupons);
        });

        // Add new coupon (Admin)
        app.post("/coupons", verifyToken, verifyAdmin, async (req, res) => {
            const coupon = req.body; // { code, discountPercent }
            const result = await couponsColl.insertOne(coupon);
            res.send(result);
        });

        // Delete coupon
        app.delete("/coupons/:id", async (req, res) => {
            const id = req.params.id;
            const result = await couponsColl.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // Get single coupon (for customer use)
        app.get("/coupon/:code", async (req, res) => {
            const code = req.params.code.toUpperCase();
            const coupon = await couponsColl.findOne({ code });
            if (!coupon) {
                return res.status(404).send({ message: "Invalid coupon code" });
            }
            res.send(coupon);
        });

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
