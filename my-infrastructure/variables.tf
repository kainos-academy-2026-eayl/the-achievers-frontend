variable "resource_group_name" {
  description = "Name of the frontend resource group."
  type        = string
  default     = "rg-acheivers-frontend-dev"
}

variable "location" {
  description = "Azure region for the resource group."
  type        = string
  default     = "uksouth"
}

variable "environment" {
  description = "Environment label applied to the resource group."
  type        = string
  default     = "dev"
}