import { EventRegistration } from "../models/EventRegistration.js";
import { Event } from "../models/Event.js";

export const customerEvents = async (req, res) => {
  if (!req.session.isAuthenticated) return res.redirect('/login');
  try {
    // Find all event registrations for this user
    const registrations = await EventRegistration.findAll({
      where: { user_id: req.session.userId },
      order: [['createdAt', 'DESC']]
    });
    // Get event details for each registration
    const eventIds = registrations.map(r => r.event_id);
    let events = [];
    if (eventIds.length > 0) {
      events = await Event.findAll({ where: { id: eventIds } });
    }
    // Map event info to registration
    const eventsMap = {};
    events.forEach(e => { eventsMap[e.id] = e; });
    const registeredEvents = registrations.map(r => ({
      ...r.dataValues,
      event: eventsMap[r.event_id] || null
    }));
    res.render('customer/events', {
      title: 'My Registered Events',
      registeredEvents
    });
  } catch (err) {
    req.session.error_msg = 'Error loading your events.';
    res.redirect('/customer/dashboard');
  }
};
