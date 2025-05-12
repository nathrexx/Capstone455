import React, { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Validation from './SignupValidation';
import axios from 'axios';

// API configuration - using the correct port from your .env
const API_URL = 'https://localhost:8081';

// Axios configuration to bypass SSL verification
const axiosConfig = {
  httpsAgent: {
    rejectUnauthorized: false
  }
};

interface FormValues {
  name: string;
  email: string;
  password: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
}

const Signup: React.FC = () => {
  const [values, setValues] = useState<FormValues>({
    name: '',
    email: '',
    password: ''
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const navigate = useNavigate();

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    console.log(`Input changed: ${name} = ${value}`);
    setValues(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    console.log("Form submitted with values:", values);
    
    const err = Validation(values);
    console.log("Validation result:", err);
    setErrors(err);

    // Check if there are any errors
    const hasErrors = Object.keys(err).length > 0;
    console.log("Has validation errors:", hasErrors);

    if (!hasErrors) {
      console.log("Sending signup request to:", `${API_URL}/signup`);
      
      axios.post(`${API_URL}/signup`, values, axiosConfig)
        .then((response) => {
          console.log("Server response:", response.data);
          alert("Registration successful! Please log in.");
          navigate('/');
        })
        .catch(err => {
          console.error("Server error:", err);
          if (err.response) {
            console.log("Error response data:", err.response.data);
            console.log("Error response status:", err.response.status);
          }
          alert("Failed to register. Please try again."); 
        });
    } else {
      console.log("Form has validation errors, not submitting");
    }
  };

  return (
    <div className="d-flex justify-content-center align-items-center bg-primary vh-100">
      <div className="bg-white p-3 rounded w-25">
        <h2>Sign-Up</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label htmlFor="name"><strong>Name</strong></label>
            <input
              type="text"
              placeholder="Enter Name"
              name="name"
              value={values.name}
              onChange={handleInput}
              className="form-control rounded-0"
            />
            {errors.name && <span className="text-danger">{errors.name}</span>}
          </div>

          <div className="mb-3">
            <label htmlFor="email"><strong>Email</strong></label>
            <input
              type="email"
              placeholder="Enter Email"
              name="email"
              value={values.email}
              onChange={handleInput}
              className="form-control rounded-0"
            />
            {errors.email && <span className="text-danger">{errors.email}</span>}
          </div>

          <div className="mb-3">
            <label htmlFor="password"><strong>Password</strong></label>
            <input
              type="password"
              placeholder="Enter Password (8+ chars with lowercase, uppercase, number)"
              name="password"
              value={values.password}
              onChange={handleInput}
              className="form-control rounded-0"
            />
            {errors.password && <span className="text-danger">{errors.password}</span>}
          </div>

          <button type="submit" className="btn btn-success w-100 rounded-0">Sign up</button>
          <p>You agree to our terms and policies</p>
          <Link to="/" className="btn btn-default border w-100 bg-light rounded-0 text-decoration-none">Login</Link>
        </form>
      </div>
    </div>
  );
};

export default Signup;