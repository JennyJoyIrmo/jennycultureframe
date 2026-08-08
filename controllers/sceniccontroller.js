import { Scenic, sequelize } from "../models/Scenic.js";

const sceniccontroller = {
  index: async (req, res) => {
    const scenics = await Scenic.findAll({ where: { status: 'active' } });
    res.render('scenic/index', { scenics });
  },

  detail: async (req, res) => {
    const { id } = req.params;
    const scenic = await Scenic.findByPk(id);
    if (!scenic) return res.status(404).send('Scenic not found');
    
    // Get upcoming events related to this scenic location
    const { Event } = await import('../models/Event.js');
    const Op = sequelize.Sequelize.Op;
    const upcomingEvents = await Event.findAll({
      where: {
        location: { [Op.like]: `%${scenic.location}%` },
        event_date: { [Op.gte]: new Date() }
      },
      order: [['event_date', 'ASC']],
      limit: 3
    });
    
    res.render('scenic/detail', { scenic, upcomingEvents });
  },

  // Basic admin CRUD (minimal)
  adminIndex: async (req, res) => {
    const scenics = await Scenic.findAll();
    res.render('admin/scenic-list', { scenics });
  },

  addNew: (req, res) => {
    res.render('admin/scenic-add');
  },

  add: async (req, res) => {
    try {
      let { title, description, location, image_url, latitude, longitude } = req.body;
      // Prefer uploaded file when present
      if (req.file && req.file.filename) {
        image_url = '/uploads/' + req.file.filename;
      }
      await Scenic.create({ title, description, location, image_url, latitude: latitude || null, longitude: longitude || null });
      res.redirect('/admin/scenic');
    } catch (err) {
      console.error('Scenic create error:', err);
      res.redirect('/admin/scenic');
    }
  }
  ,
  edit: async (req, res) => {
    const { id } = req.params;
    const scenic = await Scenic.findByPk(id);
    if (!scenic) return res.status(404).send('Scenic not found');
    res.render('admin/scenic-edit', { scenic });
  },
  update: async (req, res) => {
    const { id } = req.params;
    try {
      let { title, description, location, image_url, latitude, longitude } = req.body;
      if (req.file && req.file.filename) {
        image_url = '/uploads/' + req.file.filename;
      }
      await Scenic.update({ title, description, location, image_url, latitude: latitude || null, longitude: longitude || null }, { where: { id } });
      res.redirect('/admin/scenic');
    } catch (err) {
      console.error('Scenic update error:', err);
      res.redirect('/admin/scenic');
    }
  },
  delete: async (req, res) => {
    const { id } = req.body;
    await Scenic.destroy({ where: { id } });
    res.redirect('/admin/scenic');
  }
};

export { sceniccontroller };
