import axios from 'axios';
import React, { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Validation from './LoginValidation';

// API configuration
const API_URL = 'https://localhost:8081';

// Axios configuration to bypass SSL verification
const axiosConfig = {
  httpsAgent: {
    rejectUnauthorized: false
  }
};

interface FormValues {
  email: string;
  password: string;
}

interface FormErrors {
  email?: string;
  password?: string;
}

interface BackendError {
  msg: string;
}

interface User {
  id: number;
  name: string;
  email: string;
}

interface LoginResponse {
  success: boolean;
  user?: User;
  errors?: BackendError[];
}

const Login: React.FC = () => {
  const [values, setValues] = useState<FormValues>({
    email: '',
    password: ''
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [backendError, setBackendError] = useState<BackendError[]>([]);
  const navigate = useNavigate();

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setValues(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const err = Validation(values);
    setErrors(err);

    if (!err.email && !err.password) {
      console.log("Sending login request to:", `${API_URL}/login`);
      
      axios.post<LoginResponse>(`${API_URL}/login`, values, axiosConfig)
        .then(res => {
          console.log("Login response:", res.data);
          
          if (res.data.errors) {
            setBackendError(res.data.errors);
          } else {
            setBackendError([]);
            
            if (res.data.success && res.data.user) {
              // Store user data in localStorage for persistence
              localStorage.setItem('user', JSON.stringify(res.data.user));
              navigate('/home');
            } else {
              alert("Invalid credentials. Please try again.");
            }
          }
        })
        .catch(err => {
          console.error("Login error:", err);
          if (err.response) {
            console.log("Error response data:", err.response.data);
            console.log("Error response status:", err.response.status);
            
            if (err.response.status === 401) {
              alert("Invalid email or password. Please try again.");
            } else {
              alert("Login failed. Please check your connection and try again.");
            }
          } else {
            alert("Login failed. Please check your connection and try again.");
          }
        });
    }
  };

  return (
    <div className="d-flex justify-content-center align-items-center bg-primary vh-100">
      <div className="bg-white p-3 rounded w-25">
        <h2>Sign-In</h2>

        {backendError.length > 0 &&
          backendError.map((e, index) => (
            <p key={index} className="text-danger">{e.msg}</p>
          ))
        }

        <form onSubmit={handleSubmit}>
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
              placeholder="Enter Password"
              name="password"
              value={values.password}
              onChange={handleInput}
              className="form-control rounded-0"
            />
            {errors.password && <span className="text-danger">{errors.password}</span>}
          </div>

          <button type="submit" className="btn btn-success w-100 rounded-0">Log in</button>
          <p>You agree to our terms and policies</p>
          <Link
            to="/signup"
            className="btn btn-default border w-100 bg-light rounded-0 text-decoration-none"
          >
            Create Account
          </Link>
        </form>
      </div>
    </div>
  );
};

export default Login;