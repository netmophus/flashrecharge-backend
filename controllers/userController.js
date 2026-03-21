const User = require("../models/userModel");

const createTeacher = async (_req, res) => {
  return res.status(410).json({ message: "Ce module n'est plus disponible." });
};

const getAllTeachers = async (_req, res) => {
  return res.status(410).json({ message: "Ce module n'est plus disponible." });
};

const updateTeacher = async (_req, res) => {
  return res.status(410).json({ message: "Ce module n'est plus disponible." });
};

const deleteTeacher = async (_req, res) => {
  return res.status(410).json({ message: "Ce module n'est plus disponible." });
};

const toggleTeacherStatus = async (_req, res) => {
  return res.status(410).json({ message: "Ce module n'est plus disponible." });
};

module.exports = {
  createTeacher,
  getAllTeachers,
  updateTeacher,
  deleteTeacher,
  toggleTeacherStatus,
};
