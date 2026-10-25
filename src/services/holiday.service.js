'use strict';

const { Op } = require('sequelize');
const { db } = require('../database/client');

/**
 * Standard Indian Gazetted and National Holidays reference dates (variable holidays approximated by year)
 */
const getStandardHolidaysTemplate = (year) => {
  const y = parseInt(year, 10);
  return [
    { name: "New Year's Day", date: `${y}-01-01`, type: 'PUBLIC', description: 'Celebration of the first day of the year' },
    { name: 'Republic Day', date: `${y}-01-26`, type: 'PUBLIC', description: 'Commemorating the Constitution of India' },
    { name: 'Maha Shivratri', date: `${y}-02-26`, type: 'OPTIONAL', description: 'Hindu festival celebrating Lord Shiva' },
    { name: 'Holi', date: `${y}-03-14`, type: 'PUBLIC', description: 'Festival of colors and spring' },
    { name: 'Id-ul-Fitr (Eid)', date: `${y}-03-31`, type: 'PUBLIC', description: 'Islamic festival marking the end of Ramadan' },
    { name: 'Mahavir Jayanti', date: `${y}-04-10`, type: 'OPTIONAL', description: 'Birth anniversary of Lord Mahavira' },
    { name: 'Good Friday', date: `${y}-04-18`, type: 'PUBLIC', description: 'Christian holiday commemorating the crucifixion of Jesus' },
    { name: 'Buddha Purnima', date: `${y}-05-12`, type: 'OPTIONAL', description: 'Birth of Gautama Buddha' },
    { name: 'Bakrid / Eid ul-Adha', date: `${y}-06-07`, type: 'PUBLIC', description: 'Feast of the Sacrifice' },
    { name: 'Muharram', date: `${y}-07-06`, type: 'PUBLIC', description: 'First month of the Islamic calendar' },
    { name: 'Independence Day', date: `${y}-08-15`, type: 'PUBLIC', description: 'Commemorating Indian Independence (1947)' },
    { name: 'Janmashtami', date: `${y}-08-16`, type: 'OPTIONAL', description: 'Birth of Lord Krishna' },
    { name: 'Milad-un-Nabi (Eid-e-Milad)', date: `${y}-09-05`, type: 'OPTIONAL', description: 'Prophet Muhammad birthday' },
    { name: 'Mahatma Gandhi Jayanti', date: `${y}-10-02`, type: 'PUBLIC', description: 'Birth anniversary of Father of the Nation' },
    { name: 'Dussehra (Vijayadashami)', date: `${y}-10-21`, type: 'PUBLIC', description: 'Victory of good over evil' },
    { name: 'Diwali (Deepavali)', date: `${y}-11-09`, type: 'PUBLIC', description: 'Festival of lights' },
    { name: 'Govardhan Puja', date: `${y}-11-10`, type: 'OPTIONAL', description: 'Post-Diwali celebration' },
    { name: 'Bhai Dooj', date: `${y}-11-11`, type: 'OPTIONAL', description: 'Celebration of brother-sister bond' },
    { name: 'Guru Nanak Jayanti', date: `${y}-11-24`, type: 'PUBLIC', description: 'Birth anniversary of Guru Nanak Dev Ji' },
    { name: 'Christmas Day', date: `${y}-12-25`, type: 'PUBLIC', description: 'Celebration of the birth of Jesus Christ' },
  ];
};

/**
 * Get paginated holidays list
 */
async function getHolidays({
  year,
  type,
  status = 'ACTIVE',
  search,
  dateFrom,
  dateTo,
  page = 1,
  limit = 100,
} = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 100));
  const offset = (p - 1) * l;

  const where = {};

  if (year && year !== 'ALL') {
    where.year = parseInt(year, 10);
  }

  if (type && type !== 'ALL') {
    where.type = type;
  }

  if (status && status !== 'ALL') {
    where.status = status;
  }

  if (dateFrom && dateTo) {
    where.date = { [Op.between]: [dateFrom, dateTo] };
  } else if (dateFrom) {
    where.date = { [Op.gte]: dateFrom };
  } else if (dateTo) {
    where.date = { [Op.lte]: dateTo };
  }

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.like]: q } },
      { description: { [Op.like]: q } },
    ];
  }

  const { rows, count } = await db.Holiday.findAndCountAll({
    where,
    include: [
      {
        model: db.User,
        as: 'creator',
        attributes: ['id', 'firstName', 'lastName', 'email'],
      },
    ],
    order: [['date', 'ASC']],
    limit: l,
    offset,
  });

  return {
    data: rows,
    pagination: {
      total: count,
      page: p,
      limit: l,
      totalPages: Math.ceil(count / l),
    },
  };
}

/**
 * Get holiday by ID
 */
async function getHolidayById(id) {
  const holiday = await db.Holiday.findByPk(id, {
    include: [
      {
        model: db.User,
        as: 'creator',
        attributes: ['id', 'firstName', 'lastName', 'email'],
      },
    ],
  });
  if (!holiday) {
    const error = new Error('Holiday not found');
    error.status = 404;
    throw error;
  }
  return holiday;
}

/**
 * Create a new holiday
 */
async function createHoliday(data, userId) {
  if (!data.name || !data.date) {
    const error = new Error('Holiday name and date are required');
    error.status = 400;
    throw error;
  }

  const holidayDate = data.date.includes('T') ? data.date.split('T')[0] : data.date;
  const year = data.year ? parseInt(data.year, 10) : new Date(holidayDate).getFullYear();

  // Check duplicate
  const existing = await db.Holiday.findOne({
    where: {
      name: data.name.trim(),
      date: holidayDate,
      year,
    },
  });

  if (existing) {
    const error = new Error(`Holiday "${data.name}" already exists on ${holidayDate}`);
    error.status = 409;
    throw error;
  }

  const holiday = await db.Holiday.create({
    name: data.name.trim(),
    date: holidayDate,
    year,
    type: data.type || 'PUBLIC',
    description: data.description ? data.description.trim() : null,
    isRecurring: data.isRecurring || false,
    applicableFor: data.applicableFor || 'ALL',
    status: data.status || 'ACTIVE',
    createdById: userId,
  });

  return getHolidayById(holiday.id);
}

/**
 * Update an existing holiday
 */
async function updateHoliday(id, data, userId) {
  const holiday = await getHolidayById(id);

  const updateFields = {};
  if (data.name !== undefined) updateFields.name = data.name.trim();
  if (data.date !== undefined) {
    const dStr = data.date.includes('T') ? data.date.split('T')[0] : data.date;
    updateFields.date = dStr;
    updateFields.year = data.year ? parseInt(data.year, 10) : new Date(dStr).getFullYear();
  } else if (data.year !== undefined) {
    updateFields.year = parseInt(data.year, 10);
  }

  if (data.type !== undefined) updateFields.type = data.type;
  if (data.description !== undefined) updateFields.description = data.description ? data.description.trim() : null;
  if (data.isRecurring !== undefined) updateFields.isRecurring = data.isRecurring;
  if (data.applicableFor !== undefined) updateFields.applicableFor = data.applicableFor;
  if (data.status !== undefined) updateFields.status = data.status;

  await holiday.update(updateFields);
  return getHolidayById(id);
}

/**
 * Delete a holiday
 */
async function deleteHoliday(id, userId) {
  const holiday = await getHolidayById(id);
  await holiday.destroy();
  return { success: true, message: 'Holiday deleted successfully' };
}

/**
 * Quick-populate / seed standard holidays for a specific year
 */
async function seedStandardHolidays(year, userId) {
  const y = parseInt(year, 10) || new Date().getFullYear();
  const templateList = getStandardHolidaysTemplate(y);

  let createdCount = 0;
  let skippedCount = 0;

  for (const item of templateList) {
    const existing = await db.Holiday.findOne({
      where: {
        date: item.date,
        year: y,
      },
    });

    if (!existing) {
      await db.Holiday.create({
        name: item.name,
        date: item.date,
        year: y,
        type: item.type,
        description: item.description,
        isRecurring: true,
        applicableFor: 'ALL',
        status: 'ACTIVE',
        createdById: userId,
      });
      createdCount++;
    } else {
      skippedCount++;
    }
  }

  const allForYear = await getHolidays({ year: y });
  return {
    success: true,
    year: y,
    createdCount,
    skippedCount,
    holidays: allForYear.data,
  };
}

/**
 * Get holiday summary metrics for a year
 */
async function getHolidaysSummary(year) {
  const y = parseInt(year, 10) || new Date().getFullYear();
  const todayStr = new Date().toISOString().split('T')[0];

  const [total, publicCount, optionalCount, companyCount, upcoming] = await Promise.all([
    db.Holiday.count({ where: { year: y, status: 'ACTIVE' } }),
    db.Holiday.count({ where: { year: y, type: 'PUBLIC', status: 'ACTIVE' } }),
    db.Holiday.count({ where: { year: y, type: 'OPTIONAL', status: 'ACTIVE' } }),
    db.Holiday.count({ where: { year: y, type: 'COMPANY', status: 'ACTIVE' } }),
    db.Holiday.findAll({
      where: {
        date: { [Op.gte]: todayStr },
        status: 'ACTIVE',
      },
      order: [['date', 'ASC']],
      limit: 5,
    }),
  ]);

  return {
    year: y,
    total,
    publicCount,
    optionalCount,
    companyCount,
    upcoming,
  };
}

module.exports = {
  getHolidays,
  getHolidayById,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  seedStandardHolidays,
  getHolidaysSummary,
};
