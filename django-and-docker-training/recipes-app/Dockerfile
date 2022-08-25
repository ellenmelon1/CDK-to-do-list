#Tells Docker to use the official python 3 image from dockerhub as a base image
FROM python:3.9.1

ENV PYTHONDONTWRITEBYTECODE=1

# Sets an environmental variable that ensures output from python is sent straight to the terminal without buffering it first
ENV PYTHONUNBUFFERED=1

# Sets the container's working directory
WORKDIR /code
COPY requirements.txt /code/

# runs the pip install command for all packages listed in the requirements.txt file
RUN pip install -r requirements.txt
COPY . /code/