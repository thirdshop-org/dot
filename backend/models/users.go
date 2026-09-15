package models

type User struct {
	Username string
}

func NewUser(username string) (*User, error) {
	return &User{
		Username: username,
	}, nil
}
