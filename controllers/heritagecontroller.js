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
import { Heritage, sequelize } from "../models/Heritage.js";

const heritagecontroller = {
  index: async (req, res) => {
    try {
      const heritages = await Heritage.findAll({
        order: [['createdAt', 'DESC']]
      });
      res.render("heritage/index", { 
        heritages,
        title: 'Cultural Heritage - CultureFrame'
      });
    } catch (error) {
      console.error('Error loading heritage list:', error);
      res.render("heritage/index", { 
        heritages: [],
        error: 'Error loading heritage sites',
        title: 'Cultural Heritage - CultureFrame'
      });
    }
  },
  
  detail: async (req, res) => {
    try {
      const { id } = req.params;
      const heritage = await Heritage.findByPk(id);
      
      if (!heritage) {
        return res.status(404).render('error', { 
          message: 'Heritage site not found',
          title: 'Not Found'
        });
      }

      // Get related heritage sites (same category, excluding current)
      const relatedHeritage = await Heritage.findAll({
        where: {
          category: heritage.category,
          id: { [sequelize.Sequelize.Op.ne]: id }
        },
        limit: 3
      });

      res.render("heritage/detail", { 
        heritage,
        relatedHeritage,
        title: `${heritage.title} - CultureFrame`
      });
    } catch (error) {
      console.error('Error loading heritage detail:', error);
      res.status(500).render('error', {
        message: 'Error loading heritage site',
        title: 'Error'
      });
    }
  },
  
  adminIndex: async (req, res) => {
    const heritages = await Heritage.findAll();
    res.render("admin/heritage-list", { heritages });
  },
  
  addNew: (req, res) => {
    res.render("admin/heritage-add");
  },
  
  add: async (req, res) => {
    try {
      console.log('Request body:', req.body);
      console.log('Request file:', req.file);
      
      const { 
        title, 
        description, 
        category, 
        location, 
        image_url, 
        historical_significance, 
        year_established 
      } = req.body;

      // Validate required fields
      if (!title || !description || !category || !location) {
        return res.status(400).render('admin/heritage-add', {
          error: 'All required fields must be filled: Title, Description, Category, Location'
        });
      }

      // Handle image - use uploaded file or provided URL
      let finalImageUrl = image_url;
      if (req.file) {
        finalImageUrl = `/uploads/${req.file.filename}`;
      }

      await Heritage.create({ 
        title: title.trim(),
        description: description.trim(),
        category: category.trim(),
        location: location.trim(),
        image_url: finalImageUrl || null,
        historical_significance: historical_significance?.trim() || null,
        year_established: year_established?.trim() || null,
        status: 'active'
      });

      res.redirect("/admin/heritage");
    } catch (error) {
      console.error('Error creating heritage:', error);
      res.status(500).render('admin/heritage-add', {
        error: 'Failed to create heritage. Please try again.'
      });
    }
  },
  
  edit: async (req, res) => {
    const { id } = req.params;
    const heritage = await Heritage.findByPk(id);
    res.render("admin/heritage-edit", { heritage });
  },
  
  update: async (req, res) => {
    const { id } = req.params;
    try {
      // Extract fields from body
      const { title, description, category, location, image_url, historical_significance, year_established, status } = req.body;

      // Handle image: uploaded file takes precedence, then URL, else keep existing
      let finalImageUrl = image_url;
      if (req.file) {
        finalImageUrl = `/uploads/${req.file.filename}`;
      }

      // Update the heritage entry
      await Heritage.update({
        title: title?.trim(),
        description: description?.trim(),
        category: category?.trim(),
        location: location?.trim(),
        image_url: finalImageUrl || null,
        historical_significance: historical_significance?.trim() || null,
        year_established: year_established?.trim() || null,
        status: status || 'active'
      }, { where: { id } });

      res.redirect("/admin/heritage");
    } catch (error) {
      console.error('Error updating heritage:', error);
      res.status(500).render('admin/heritage-edit', {
        heritage: { id: req.params.id, ...req.body },
        error: 'Failed to update heritage. Please try again.'
      });
    }
  },
  
  delete: async (req, res) => {
    const { id } = req.body;
    await Heritage.destroy({ where: { id } });
    res.redirect("/admin/heritage");
  }
};

export { heritagecontroller };