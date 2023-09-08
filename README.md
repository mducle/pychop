# PyChop Stand-alone

PyChop is a program to calculate the energy resolution of a time-of-flight (ToF) neutron spectrometer
from the burst time of the instruments moderator and the opening times of its choppers.

The code is based on `CHOP`, a fortran program written by T. G. Perring,
and `multirep`, a Matlab program by R. I. Bewley.

This is a port of the [Mantid PyChop](https://github.com/mantidproject/mantid/tree/master/scripts/PyChop) code to work without Mantid.

Further documentation is available on the [Mantid webpage](https://docs.mantidproject.org/nightly/interfaces/PyChop.html)


## Installation
Optionally create and activate a `venv` virtual environment to isolate `PyChop` from your system packages
```shell
python -m venv pychop
source pychop/bin/activate
```

Clone and install this repository with pip, e.g.:
```shell
python -m pip install git+https://github.com/mducle/pychop.git
```
this installation method should ensure that all requisite dependencies are available.

## Usage
Launch the `PyChop` GUI via the installed project script
```shell
PyChop
```