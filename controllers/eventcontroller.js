/*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */
import { Event, sequelize } from "../models/Event.js";
await sequelize.sync();

const eventcontroller = {
  cleanupExpiredEvents: async () => {
    try {
      await Event.destroy({
        where: {
          event_date: {
            [sequelize.Sequelize.Op.lt]: new Date()
          }
        }
      });
    } catch (err) {
      console.error('Error cleaning up expired events:', err);
    }
  },
  index: async (req, res) => {
    await eventcontroller.cleanupExpiredEvents();
    const events = await Event.findAll({ where: { event_date: { [sequelize.Sequelize.Op.gte]: new Date() } } });
    res.render("events/index", { events });
  },
  
  detail: async (req, res) => {
    const { id } = req.params;
    const event = await Event.findByPk(id);
    res.render("events/detail", { event });
  },
  
  // Show registration form
  registerPage: async (req, res) => {
    const { id } = req.params;
    const event = await Event.findByPk(id);
    if (!event) return res.status(404).send('Event not found');

    // Prefill from session if logged in
    const prefill = {
      name: req.session && req.session.userName ? req.session.userName : '',
      email: req.session && req.session.userEmail ? req.session.userEmail : '',
      phone: req.session && req.session.userPhone ? req.session.userPhone : ''
    };

    res.render('events/register', { event, prefill });
  },

  // Handle registration submission
  register: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, email, phone } = req.body;
      const { EventRegistration } = await import('../models/EventRegistration.js');

      await EventRegistration.create({ event_id: Number(id), user_id: req.session && req.session.userId ? Number(req.session.userId) : null, name, email, phone });

      req.session.success_msg = 'Registration successful. See you at the event!';
      return res.redirect(`/events/${id}`);
    } catch (err) {
      console.error('Event registration error:', err);
      req.session.error_msg = 'Could not register for event. Please try again.';
      return res.redirect('back');
    }
  },
  
  adminIndex: async (req, res) => {
    await eventcontroller.cleanupExpiredEvents();
    const events = await Event.findAll();
    res.render("admin/event-list", { events });
  },
  
  addNew: (req, res) => {
    res.render("admin/event-add");
  },
  
  add: async (req, res) => {
    try {
      const { title, description, event_date, location, image_url, category } = req.body;
      let finalImageUrl = image_url && image_url.trim() !== '' ? image_url.trim() : null;
      if (req.file) {
        finalImageUrl = '/uploads/' + req.file.filename;
      }
      await Event.create({ title, description, event_date, location, image_url: finalImageUrl, category });
      req.flash('success_msg', 'Event added successfully.');
      res.redirect("/admin/events");
    } catch (err) {
      console.error('Event add error:', err);
      req.flash('error_msg', 'Could not add event. Please check your input.');
      res.redirect('back');
    }
  },
  
  edit: async (req, res) => {
    const { id } = req.params;
    const event = await Event.findByPk(id);
    res.render("admin/event-edit", { event });
  },
  
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, event_date, location, image_url, category } = req.body;
      let finalImageUrl = image_url && image_url.trim() !== '' ? image_url.trim() : null;
      if (req.file) {
        finalImageUrl = '/uploads/' + req.file.filename;
      }
      await Event.update({ title, description, event_date, location, image_url: finalImageUrl, category }, { where: { id } });
      req.flash('success_msg', 'Event updated successfully.');
      res.redirect("/admin/events");
    } catch (err) {
      console.error('Event update error:', err);
      req.flash('error_msg', 'Could not update event. Please check your input.');
      res.redirect('back');
    }
  },
  
  delete: async (req, res) => {
    const { id } = req.body;
    try {
      const deletedCount = await Event.destroy({ where: { id } });
      if (deletedCount) {
        req.flash('success_msg', 'Event deleted successfully.');
      } else {
        req.flash('error_msg', 'Event not found or already deleted.');
      }
    } catch (err) {
      console.error('Event delete error:', err);
      req.flash('error_msg', 'Unable to delete event. Please try again.');
    }
    res.redirect("/admin/events");
  }
};

export { eventcontroller };