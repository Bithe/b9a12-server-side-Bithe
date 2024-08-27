//SERVER SETUP

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
// const cookieParser = require("cookie-parser");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

//CONFIG
const app = express();
const port = process.env.PORT || 5000;

// //MIDDLEWARE

const corsConfig = {
  origin: [
    "*",
    "http://localhost:5174",
    "http://localhost:5173",
    "http://localhost:5175",
   
    "https://easy-bookings-server-3yx66f4nv-bithes-projects.vercel.app",
    "https://easy-bookings-server.vercel.app"
  ],
  credentials: true,
};
app.use(cors(corsConfig));
app.use(express.json());
// app.use(cookieParser());

// CONNECT TO DB

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mfawfp8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const cookieOptions = {
  httpOnly: true,
  secure: false,
  sameSite: "strict",
};
//localhost:5000 and localhost:5173 are treated as same site.  so sameSite value must be strict in development server.  in production sameSite will be none
// in development server secure will false .  in production secure will be true

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    //------------------------ DB CREATE
    const surveyCollection = client
      .db("zendeskDb")
      .collection("surveyQuestions");
    const usersCollection = client
      .db("zendeskDb")
      .collection("usersCollection");
    const usersResponseCollection = client
      .db("zendeskDb")
      .collection("usersResponseCollection");

    const reportsCollection = client
      .db("zendeskDb")
      .collection("reportsCollection");

    // JWT GENERATOR
    // app.post("/jwt", async (req, res) => {
    //   const user = req.body;
    //   console.log("I need a new jwt", user);
    //   const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
    //     expiresIn: "365d",
    //   });
    //   res.cookie("token", token, cookieOptions).send({ success: true });
    // });
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    });
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' });
        }
        req.decoded = decoded;
        next();
      });
    };
    
    
    //clearing Token
    app.post("/logout", async (req, res) => {
      const user = req.body;
      // console.log("logging out", user);
      res
        .clearCookie("token", { ...cookieOptions, maxAge: 0 })
        .send({ success: true });
    });
   
    

    // DATA
    // ---------------------------------------------------HOME STARTS

    // GET ALL THE PUBLISHED STATUS POSTED SURVEYS FOR HOME PAGE LATEST SURVEYS
    app.get("/recent-surveys", async (req, res) => {
      try {
        const query = { status: "publish" };
        const result = await surveyCollection.find(query).toArray();
        // console.log("Fetched Surveys:", result); 
        const reversedResult = result.reverse();
        // console.log(reversedResult);

        res.send(reversedResult);
      } catch (error) {
        console.error("Error fetching recent surveys:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    // GET THE MOST VOTED/REPONSES SURVEYS FROM DB
    app.get("/most-voted-surveys", async (req, res) => {
      try {
        const query = { status: "publish" };

        const result = await surveyCollection
          .find(query)
          .sort({ responseCount: -1 }) // Sort by responseCount in descending order
          .limit(6) // Limit to 6 surveys
          .toArray(); // Convert to array

        res.send(result);
      } catch (error) {
        console.error("Error fetching most voted surveys:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    // SURVEY RESULTS PAGE CHART
    app.get("/survey-results/:id", async (req, res) => {
      const surveyId = req.params.id;
      try {
        const survey = await surveyCollection.findOne({
          _id: new ObjectId(surveyId),
        });
        const responses = await usersResponseCollection
          .find({ surveyId })
          .toArray();
        const questions = survey.questions.map((question) => ({
          ...question,
          responses: responses.map((response) =>
            response.responses.find((r) => r.questionId === question.qId)
          ),
        }));
        res.send({ ...survey, questions });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // ---------------------------------------------------HOME ENDS

    // ---------------------------------------------------SURVEYS PAGE STARTS
    app.get("/all-surveys", async (req, res) => {
      try {
        const { category, sort } = req.query;

        // Base query to find published surveys
        let query = { status: "publish" };

        // If category filter is provided, add it to the query
        if (category) {
          query.category = category;
        }

        // Fetch surveys that match the query
        let result = await surveyCollection.find(query).toArray();

        // Sort by response count if specified
        if (sort === "responseCount") {
          result.sort((a, b) => b.responseCount - a.responseCount);
        }

        // Reverse the results to get the latest surveys first
        const reversedResult = result;

        // console.log("Fetched Surveys:", reversedResult);
        res.send(reversedResult);
      } catch (error) {
        console.error("Error fetching recent surveys:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    // ---------------------------------------------------SURVEYS PAGE ENDS

    // -------------------------------------ADMIN STARTS

    // SAVE USER
    app.put("/user", async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      // CHECKING IF ALREADY USER IN DB
      const isExist = await usersCollection.findOne(query);
      if (isExist) {
        if (user.status === "Requested") {
          // if existing user try to change his role
          const result = await usersCollection.updateOne(query, {
            $set: { status: user?.status },
          });
          return res.send(result);
        } else {
          // if existing user login again
          return res.send(isExist);
        }
      }

      // SAVING USER FOR THE FIRST TIME
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    // ALL USERS FROM DB
    app.get("/users", verifyToken, async (req, res) => {
      console.log('for token----------------',req.headers);
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // FIND THE USER ROLE BY EMAIL
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });

    // UPDATE USER ROLE
    app.patch("/users/update/:email", async (req, res) => {
      const email = req.params.email;
      const { role, status } = req.body;
      const query = { email };

      console.log("Received request to update user role:", {
        email,
        role,
        status,
      });

      try {
        const updateDoc = {
          $set: { role, status, timestamp: Date.now() },
        };

        const result = await usersCollection.updateOne(query, updateDoc);

        // console.log("Update result:", result);

        if (result.modifiedCount === 1) {
          res.status(200).send("User role updated successfully");
        } else {
          res
            .status(404)
            .send("No documents matched the query. Updated 0 documents.");
        }
      } catch (error) {
        console.error("Error updating user role:", error);
        res.status(500).send("Error updating user role");
      }
    });

    // UPDATE A SURVEY STATUS BY ADMIN
    // -----
    // app.patch("/admin/survey/update/:id", async (req, res) => {
    //   const id = req.params.id;
    //   if (!ObjectId.isValid(id)) {
    //     return res.status(400).send("Invalid survey ID");
    //   }
    //   const filter = { _id: new ObjectId(id) };
    //   const status = req.body.status;

    //   try {
    //     const updateDoc = {
    //       $set: { status },
    //     };

    //     const result = await surveyCollection.updateOne(filter, updateDoc);

    //     console.log("Update result:", result);

    //     if (result.modifiedCount === 1) {
    //       res.status(200).send("Survey status updated successfully");
    //     } else {
    //       res
    //         .status(404)
    //         .send("No documents matched the query. Updated 0 documents.");
    //     }
    //   } catch (error) {
    //     console.error("Error updating survey status:", error);
    //     res.status(500).send("Error updating survey status");
    //   }
    // });

    app.patch("/admin/survey/update/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send("Invalid survey ID");
      }
      const filter = { _id: new ObjectId(id) };
      const { status, feedback } = req.body;

      try {
        const updateDoc = {
          $set: { status, feedback },
        };

        const result = await surveyCollection.updateOne(filter, updateDoc);

        console.log("Update result:", result);

        if (result.modifiedCount === 1) {
          res.status(200).send("Survey status updated successfully");
        } else {
          res
            .status(404)
            .send("No documents matched the query. Updated 0 documents.");
        }
      } catch (error) {
        console.error("Error updating survey status:", error);
        res.status(500).send("Error updating survey status");
      }
    });

    // ----.....

    // GET/SHOW ALL THE PAYMENTS FOR ALL PAYMENTS PAGE, ONLY THE PAYMENTS USER INFO
    app.get("/dashboard/admin/payments", async (req, res) => {
      try {
        const payments = await usersCollection
          .find({ role: "pro-user" })
          .toArray();
        res.status(200).json(payments);
      } catch (error) {
        console.error("Error fetching payments:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    // GET/SHOW ALL SURVEY RESPONSES
    app.get("/dashboard/admin/survey-responses", async (req, res) => {
      try {
        const surveyResponses = await usersResponseCollection.find().toArray();
        res.status(200).json(surveyResponses);
      } catch (error) {
        console.error("Error fetching survey responses:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    //------------------------------------ADMIN ENDS

    //------------------------------------USER STARTS

    // POST THE USER RESPONSE TO THE DB FOR THAT SURVEY

    // -----------

    app.post("/user-response", async (req, res) => {
      const userResponseData = req.body;

      try {
        const result = await usersResponseCollection.insertOne(
          userResponseData
        );

        for (const response of userResponseData.responses) {
          const fieldToUpdate =
            response.option === "yes"
              ? "questions.$.yesCount"
              : "questions.$.noCount";
          const updateOperations = {
            $inc: { [fieldToUpdate]: 1, responseCount: 1 },
          };

          await surveyCollection.updateOne(
            {
              _id: new ObjectId(userResponseData.surveyId),
              "questions.qId": response.questionId,
            },
            updateOperations
          );
        }
        await surveyCollection.updateOne(
          { _id: new ObjectId(userResponseData.surveyId) },
          { $inc: { vote: 1 } }
        );

        res.send(result);
      } catch (error) {
        console.error("Error adding recommendation:", error);
        res
          .status(500)
          .send("Error adding recommendation. Please try again later.");
      }
    });

    // ..........

    // POST THE USER REPORT TO THE DB--------------------------
    app.post("/report-survey", async (req, res) => {
      const reportData = req.body;

      try {
        // Insert the report data into the database
        const result = await reportsCollection.insertOne(reportData);
        res.send(result);
      } catch (error) {
        console.error("Error reporting survey:", error);
        res.status(500).send("Error reporting survey. Please try again later.");
      }
    });

    // GET ALL THE REPORTS FOR USER FROM DB FOR MY MY REPORTS PAGE
    app.get("/user/my-reports/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await reportsCollection.find(query).toArray();
      res.send(result);
    });

    // GET ALL THE responses FOR USER FROM DB FOR MY RESPONSES PAGE
    app.get("/my-responses/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersResponseCollection.find(query).toArray();
      res.send(result);
    });

    // ............................................. USER ENDS

    // -------------------------------------SURVEYOR STARTS
    // POST THE SURVEY TO DB FROM CREATE SURVEY PAGE
    app.post("/surveys", async (req, res) => {
      try {
        // console.log(req.body);
        const result = await surveyCollection.insertOne(req.body);
        res.send(result);
      } catch (error) {
        console.error("Error storing survey to database:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    //   GET ALL SURVEYS
    app.get("/surveys", async (req, res) => {
      try {
        const surveys = await surveyCollection.find().toArray();
        res.json(surveys);
      } catch (error) {
        console.error("Error fetching surveys:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    // GET A SURVEY BY ID FOR USER TO PARTICIPATE THAT SURVEY
    app.get("/survey/:id", async (req, res) => {
      const id = req.params.id;

      // Validate ID format
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid ID format" });
      }

      try {
        const result = await surveyCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!result) {
          return res.status(404).send({ message: "Survey not found" });
        }
        res.send(result);
      } catch (error) {
        console.error("Error fetching survey:", error);
        res
          .status(500)
          .send({ message: "Error fetching survey. Please try again later." });
      }
    });

    // GET THE SURVEYS BY USER EMAIL FOR MY SURVEYS PAGE FOR THAT USER ONLY
    app.get("/surveys/:email", async (req, res) => {
      const email = req.params.email;
      const query = { "surveyor.email": email };
      const result = await surveyCollection
        .find(query)
        .sort({ _id: -1 })
        .toArray();
      res.send(result);
    });

    // GET A SINGLE SURVEY FOR UPDATE SURVEY PAGE
    app.get("/survey/questions/:qId", async (req, res) => {
      const qId = req.params.qId;
      const query = { "questions.qId": qId };
      try {
        const survey = await surveyCollection.findOne({ "questions.qId": qId });
        if (!survey) {
          return res.status(404).send("Survey not found");
        }

        const question = survey.questions.find((q) => q.qId === qId);
        if (!question) {
          return res.status(404).send("Question not found");
        }

        // console.log("Question:", question);
        res.send(question);
      } catch (error) {
        console.error("Error fetching survey:", error);
        res.status(500).send("Error fetching survey");
      }
    });

    // SURVEY RESPONSES---
    // GET surveys added by the currently logged-in user

    // GET individual survey responses for a specific survey
    app.get("/dashboard/surveyor/surveys/:id", async (req, res) => {
      const surveyId = req.params.id;
      try {
        const surveyResponses = await usersResponseCollection
          .find({ surveyId })
          .toArray();
        res.status(200).json(surveyResponses);
      } catch (error) {
        console.error("Error fetching survey responses:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    // GET THE FEEDBACK FOR THIS SURVEYOUR UNPUBLISHED SURVEY BY ADMIN
    app.get("/dashboard/surveyor/feedbacks/:email", async (req, res) => {
      const email = req.params.email;
      const query = { "surveyor.email": email, status: "unpublish" }; // Combine both conditions

      try {
        const feedbacks = await surveyCollection.find(query).toArray();
        res.json(feedbacks);
      } catch (error) {
        console.error("Error fetching unpublished surveys:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // ----------------------------  SURVEY DELETE

    app.delete("/surveys/:id", async (req, res) => {
      const id = req.params.id;
      // console.log("Deleted id:", id);
      const result = await surveyCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // ----------------------------  SURVEY UPDATE

    // UPDATE A SINGLE SURVEY TO SERVER

    // ------.......
    app.put("/update/survey/:id", async (req, res) => {
      const id = req.params.id;

      // Validate ID format
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid ID format" });
      }

      const { title, description, category, deadline, questions } = req.body;
      // console.log('Received update request with data:', req.body);

      try {
        // Fetch the existing survey data
        const existingSurvey = await surveyCollection.findOne({
          _id: new ObjectId(id),
        });
        // console.log("existing surevy----------", existingSurvey);
        if (!existingSurvey) {
          return res.status(404).send({ message: "Survey not found" });
        }

        const updateFields = {};

        // Check each field and update if new value is defined
        updateFields.title = title || existingSurvey.title;
        updateFields.description = description || existingSurvey.description;
        updateFields.category = category || existingSurvey.category;
        updateFields.deadline = deadline || existingSurvey.deadline;

        updateFields.questions =
          questions !== undefined
            ? existingSurvey.questions.map((existingQuestion) => {
                const updatedQuestion = questions.find(
                  (q) => q.qId === existingQuestion.qId
                );
                return updatedQuestion
                  ? { ...existingQuestion, ...updatedQuestion }
                  : existingQuestion;
              })
            : existingSurvey.questions;

        console.log("updatesfiled---------------", updateFields);
        const result = await surveyCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateFields }
        );

        // console.log("result-----------------", result);
        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Survey not found" });
        }

        res.send({ message: "Survey updated successfully" });
      } catch (error) {
        // console.error("Error updating survey:", error);
        res
          .status(500)
          .send({ message: "Error updating survey. Please try again later." });
      }
    });
    // ........

    // ..................................................SURVEYOR ENDS

    // ------------------------------------PRO-USER STARTS
    // GET THE PRO-USER COMMENTS BY EMAIL FOR COMMENTS PAGE
    app.get("/pro-user/comments/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersResponseCollection.find({ email }).toArray();
      // console.log(result);
      res.send(result);
    });

    // ................................................PRO USER ENDS

    // ----------------------------------STRIPE PAYMENT STARTS
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const priceInCent = parseFloat(price) * 100;
      if (!price || priceInCent < 1)
        return res.status(400).send("Invalid price");

      try {
        const { client_secret } = await stripe.paymentIntents.create({
          amount: priceInCent,
          currency: "usd",
          automatic_payment_methods: {
            enabled: true,
          },
        });
        res.send({ clientSecret: client_secret });
      } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    app.put("/payment/pro-user", async (req, res) => {
      const { email, price, transactionId, status, role } = req.body;
      const query = { email };

      try {
        const isExist = await usersCollection.findOne(query);
        const updateDoc = {
          $set: {
            price,
            transactionId,
            status,
            role,
            timestamp: Date.now(),
          },
        };

        if (isExist) {
          const result = await usersCollection.updateOne(query, updateDoc);
          return res.send(result);
        } else {
          const options = { upsert: true };
          const result = await usersCollection.updateOne(
            query,
            updateDoc,
            options
          );
          return res.send(result);
        }
      } catch (error) {
        console.error("Error updating user payment info:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    app.patch("/payment/pro-user/update/:email", async (req, res) => {
      const email = req.params.email;
      const { role, status } = req.body;
      const query = { email };

      try {
        const updateDoc = {
          $set: { role, status, timestamp: Date.now() },
        };

        const result = await usersCollection.updateOne(query, updateDoc);

        if (result.modifiedCount === 1) {
          res.status(200).send("User role updated successfully");
        } else {
          res
            .status(404)
            .send("No documents matched the query. Updated 0 documents.");
        }
      } catch (error) {
        console.error("Error updating user role:", error);
        res.status(500).send("Error updating user role");
      }
    });

    //    DATA END

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

//ROOT
app.get("/", (req, res) => {
  res.send("Zendesk server is running");
});

app.listen(port, () => {
  console.log(`Zendesk server is running on port: ${port}`);
});
