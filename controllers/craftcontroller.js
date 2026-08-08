import { Craft, sequelize } from "../models/Craft.js";

const craftcontroller = {
  index: async (req, res) => {
    const crafts = await Craft.findAll({ where: { status: 'active' } });
    res.render('crafts/index', { crafts });
  },

  detail: async (req, res) => {
    const { id } = req.params;
    const craft = await Craft.findByPk(id);
    if (!craft) return res.status(404).send('Craft not found');
    res.render('crafts/detail', { craft });
  },

  // Admin hooks
  adminIndex: async (req, res) => {
    const crafts = await Craft.findAll();
    res.render('admin/craft-list', { crafts });
  },

  addNew: (req, res) => {
    const error_msg = req.session.error_msg || null;
    const success_msg = req.session.success_msg || null;
    req.session.error_msg = null;
    req.session.success_msg = null;
    res.render('admin/craft-add', { error_msg, success_msg });
  },

  add: async (req, res) => {
    try {
      console.log('🔽 /admin/crafts/add body:', req.body);
      let { title, description, location, image_url, latitude, longitude } = req.body;
      // If an image file was uploaded, prefer it over image_url
      if (req.file && req.file.filename) {
        image_url = '/uploads/' + req.file.filename;
      }
      title = title && title.trim();
      description = description && description.trim();
      location = location && location.trim();

      // Basic validation
      if (!title) {
        req.session.error_msg = 'Title is required.';
        return res.redirect('/admin/crafts/add');
      }

      // If latitude/longitude are missing but location looks like "lat,lon", parse it
      if ((!latitude || !longitude || latitude === '' || longitude === '') && location) {
        const parts = location.split(',').map(p => p.trim());
        if (parts.length === 2 && !isNaN(parseFloat(parts[0])) && !isNaN(parseFloat(parts[1]))) {
          latitude = parseFloat(parts[0]);
          longitude = parseFloat(parts[1]);
        }
      }

      const latVal = (latitude !== undefined && latitude !== '') ? Number(latitude) : null;
      const lngVal = (longitude !== undefined && longitude !== '') ? Number(longitude) : null;

      await Craft.create({ title, description, location, image_url, latitude: latVal || null, longitude: lngVal || null });
      req.session.success_msg = 'Craft created successfully.';
      return res.redirect('/admin/crafts');
    } catch (err) {
      console.error('❌ Craft create error:', err);
      if (err && err.errors && Array.isArray(err.errors)) {
        const details = err.errors.map(e => e.message).join('; ');
        req.session.error_msg = 'Failed to create craft: ' + details;
      } else {
        req.session.error_msg = 'Failed to create craft. ' + (err.message || '');
      }
      return res.redirect('/admin/crafts/add');
    }
  }
  ,
  edit: async (req, res) => {
    const { id } = req.params;
    const craft = await Craft.findByPk(id);
    if (!craft) return res.status(404).send('Craft not found');
    const error_msg = req.session.error_msg || null;
    const success_msg = req.session.success_msg || null;
    req.session.error_msg = null;
    req.session.success_msg = null;
    res.render('admin/craft-edit', { craft, error_msg, success_msg });
  },
  update: async (req, res) => {
    const { id } = req.params;
    try {
      console.log('🔽 /admin/crafts/update body:', req.body);
      let { title, description, location, image_url, latitude, longitude } = req.body;
      // If an image file was uploaded, prefer it over image_url
      if (req.file && req.file.filename) {
        image_url = '/uploads/' + req.file.filename;
      }
      title = title && title.trim();
      description = description && description.trim();
      location = location && location.trim();

      if (!title) {
        req.session.error_msg = 'Title is required.';
        return res.redirect('/admin/crafts/edit/' + id);
      }

      if ((!latitude || !longitude || latitude === '' || longitude === '') && location) {
        const parts = location.split(',').map(p => p.trim());
        if (parts.length === 2 && !isNaN(parseFloat(parts[0])) && !isNaN(parseFloat(parts[1]))) {
          latitude = parseFloat(parts[0]);
          longitude = parseFloat(parts[1]);
        }
      }

      const latVal = (latitude !== undefined && latitude !== '') ? Number(latitude) : null;
      const lngVal = (longitude !== undefined && longitude !== '') ? Number(longitude) : null;

      await Craft.update({ title, description, location, image_url, latitude: latVal || null, longitude: lngVal || null }, { where: { id } });
      req.session.success_msg = 'Craft updated successfully.';
      return res.redirect('/admin/crafts');
    } catch (err) {
      console.error('❌ Craft update error:', err);
      if (err && err.errors && Array.isArray(err.errors)) {
        const details = err.errors.map(e => e.message).join('; ');
        req.session.error_msg = 'Failed to update craft: ' + details;
      } else {
        req.session.error_msg = 'Failed to update craft. ' + (err.message || '');
      }
      return res.redirect('/admin/crafts/edit/' + id);
    }
  },
  delete: async (req, res) => {
    const { id } = req.body;
    await Craft.destroy({ where: { id } });
    res.redirect('/admin/crafts');
  }
};

export { craftcontroller };
