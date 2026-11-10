import express from "express";
import { discoverController } from "../controllers/discoverController.js";

const router = express.Router();

router.get("/", discoverController.index);
router.get("/search", discoverController.search);
router.get("/:module", discoverController.list);
router.get("/:module/:slug", discoverController.detail);

export default router;
